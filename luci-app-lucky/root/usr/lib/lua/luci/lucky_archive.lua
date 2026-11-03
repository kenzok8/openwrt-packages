-- SPDX-License-Identifier: Apache-2.0
-- Stored ZIP entries keep this portable to old OpenWrt without zip/unzip.
-- Stream file bytes in bounded chunks; never buffer an entire configuration.
local M = {
	comment = "LUCI-LUCKY-DIRECTORY-BACKUP:1",
	max_archive = 64 * 1024 * 1024,
	max_data = 64 * 1024 * 1024,
	max_entries = 10000
}

local function uint(s, offset, length)
	local value = 0
	for i = offset + length - 1, offset, -1 do
		value = value * 256 + assert(s:byte(i), "Truncated ZIP")
	end
	return value
end

local function check_extra(s)
	local offset = 1
	while offset <= #s do
		local tag, length = uint(s, offset, 2), uint(s, offset + 2, 2)
		assert(offset + 3 + length <= #s and (tag == 0x5455 or tag == 0x7875), "Unsupported ZIP extra field")
		offset = offset + 4 + length
	end
end

function M.valid_path(name)
	if #name == 0 or #name > 1024 or name:find("[%z\1-\31\127\\:]") or name:sub(1, 1) == "/" then return false end
	local path = name:gsub("/$", "")
	if path == "" or path:find("//", 1, true) then return false end
	for part in path:gmatch("[^/]+") do
		if part == "." or part == ".." then return false end
	end
	return true
end

function M.inspect(path)
	local f = assert(io.open(path, "rb"), "Cannot read archive")
	local ok, result = pcall(function()
		local size = assert(f:seek("end"))
		assert(size >= 22 and size <= M.max_archive, "ZIP must be at most 64 MiB")
		local function read(offset, length)
			assert(offset >= 0 and length >= 0 and offset + length <= size, "Truncated ZIP")
			assert(f:seek("set", offset))
			local s = f:read(length)
			assert(s and #s == length, "Truncated ZIP")
			return s
		end
		-- The exact comment distinguishes full-directory backups from Lucky's
		-- module exports, which must not be restored by copying files.
		local endpos = size - 22 - #M.comment
		local e = read(endpos, 22 + #M.comment)
		assert(e:sub(1, 4) == "PK\5\6" and uint(e, 21, 2) == #M.comment and e:sub(23) == M.comment,
			"Not a LuCI Lucky full-directory backup")
		assert(uint(e, 5, 2) == 0 and uint(e, 7, 2) == 0, "Multi-volume ZIP is not supported")
		local count, central_size, central = uint(e, 11, 2), uint(e, 13, 4), uint(e, 17, 4)
		assert(count > 0 and count <= M.max_entries and uint(e, 9, 2) == count, "Invalid ZIP entry count")
		assert(central + central_size == endpos, "Invalid ZIP directory")
		local position, total, next_local, seen, entries = central, 0, 0, {}, {}
		for _ = 1, count do
			local h = read(position, 46)
			assert(h:sub(1, 4) == "PK\1\2", "Invalid ZIP entry")
			local flags, method = uint(h, 9, 2), uint(h, 11, 2)
			-- Accept only regular stored entries, without encryption,
			-- data descriptors, ZIP64 or platform-specific extraction features.
			assert((flags == 0 or flags == 2 or flags == 4 or flags == 6 or flags == 2048) and
				method == 0 and uint(h, 7, 2) <= 20, "Unsupported ZIP encoding; use an original LuCI directory backup")
			local packed, unpacked = uint(h, 21, 4), uint(h, 25, 4)
			assert(packed == unpacked, "Invalid stored ZIP size")
			local nlen, xlen, clen = uint(h, 29, 2), uint(h, 31, 2), uint(h, 33, 2)
			local offset = uint(h, 43, 4)
			local name = read(position + 46, nlen)
			check_extra(read(position + 46 + nlen, xlen))
			assert(M.valid_path(name), "Unsafe ZIP path")
			local key = name:gsub("/$", "")
			assert(not seen[key], "Duplicate ZIP path")
			local directory = name:sub(-1) == "/"
			seen[key] = directory and "directory" or "file"
			local mode = math.floor(uint(h, 39, 4) / 65536)
			local kind = math.floor(mode / 4096) % 16
			assert(kind == 0 or (directory and kind == 4) or (not directory and kind == 8), "Links and special files are not supported")
			assert(uint(h, 35, 2) == 0 and (not directory or unpacked == 0), "Invalid ZIP file type")
			total = total + unpacked
			assert(total <= M.max_data, "Unpacked backup exceeds 64 MiB")
			local l = read(offset, 30)
			local ln, lx = uint(l, 27, 2), uint(l, 29, 2)
			check_extra(read(offset + 30 + ln, lx))
			assert(offset == next_local and l:sub(1, 4) == "PK\3\4" and
				uint(l, 7, 2) == flags and uint(l, 9, 2) == method and
				l:sub(15, 26) == h:sub(17, 28) and ln == nlen and read(offset + 30, ln) == name,
				"Inconsistent ZIP headers")
			next_local = offset + 30 + ln + lx + packed
			assert(next_local <= central, "Overlapping ZIP entries")
			entries[#entries + 1] = { name = key, directory = directory, size = unpacked,
				offset = offset + 30 + ln + lx, crc = uint(h, 17, 4), mode = mode % 512,
				date = uint(h, 15, 2), time = uint(h, 13, 2) }
			position = position + 46 + nlen + xlen + clen
		end
		assert(position == endpos and next_local == central, "Unexpected ZIP data")
		for name in pairs(seen) do
			for parent in name:gmatch("(.+)/") do
				while parent do
					assert(seen[parent] == "directory", "ZIP has a missing or conflicting parent directory")
					parent = parent:match("^(.*)/[^/]+$")
				end
			end
		end
		return { entries = entries, bytes = total, count = count }
	end)
	f:close()
	if not ok then error(result, 0) end
	return result
end

local function le(value, length)
	local bytes = {}
	for _ = 1, length do bytes[#bytes + 1] = string.char(value % 256); value = math.floor(value / 256) end
	return table.concat(bytes)
end

function M.write(directory, output, entries)
	local crc32 = require("nixio").bin.crc32
	local f = assert(io.open(output, "wb"))
	local ok, err = pcall(function()
		local central = {}
		for _, entry in ipairs(entries) do
			local name = entry.name .. (entry.directory and "/" or "")
			local size = entry.directory and 0 or entry.size
			local stamp = os.date("*t", entry.mtime)
			local date = (math.max(1980, math.min(2107, stamp.year)) - 1980) * 512 + stamp.month * 32 + stamp.day
			local time = stamp.hour * 2048 + stamp.min * 32 + math.floor(stamp.sec / 2)
			local offset = assert(f:seek())
			local common = le(20, 2) .. le(2048, 2) .. le(0, 2) .. le(time, 2) .. le(date, 2)
			assert(f:write("PK\3\4" .. common .. le(0, 4) .. le(size, 4) .. le(size, 4) .. le(#name, 2) .. le(0, 2) .. name))
			local crc = 0
			if not entry.directory then
				local source = assert(io.open(directory .. "/" .. entry.name, "rb"))
				local copied, failure = pcall(function()
					local remaining = size
					while remaining > 0 do
						local block = assert(source:read(math.min(65536, remaining)), "Configuration changed during backup")
						remaining = remaining - #block
						crc = crc32(block, crc)
						assert(f:write(block))
					end
					assert(source:read(1) == nil, "Configuration changed during backup")
				end)
				source:close()
				if not copied then error(failure, 0) end
			end
			crc = crc % 4294967296
			local finish = assert(f:seek())
			assert(f:seek("set", offset + 14)); assert(f:write(le(crc, 4))); assert(f:seek("set", finish))
			local mode = (entry.directory and 16384 or 32768) + entry.mode
			central[#central + 1] = "PK\1\2" .. le(788, 2) .. common .. le(crc, 4) .. le(size, 4) .. le(size, 4) ..
				le(#name, 2) .. le(0, 2) .. le(0, 2) .. le(0, 2) .. le(0, 2) .. le(mode * 65536, 4) .. le(offset, 4) .. name
			assert(finish <= M.max_archive, "ZIP exceeds 64 MiB")
		end
		local offset = assert(f:seek())
		for _, header in ipairs(central) do assert(f:write(header)) end
		local size = assert(f:seek()) - offset
		assert(f:write("PK\5\6" .. le(0, 4) .. le(#entries, 2) .. le(#entries, 2) .. le(size, 4) .. le(offset, 4) .. le(#M.comment, 2) .. M.comment))
		assert(f:seek() <= M.max_archive, "ZIP exceeds 64 MiB")
	end)
	local closed = f:close()
	assert(ok, err); assert(closed, "Cannot finish ZIP backup")
end

-- Passing no destination validates every CRC without writing configuration.
function M.extract(path, info, destination)
	local fs, crc32 = require "nixio.fs", require("nixio").bin.crc32
	local f = assert(io.open(path, "rb"))
	local function mkdir(path)
		local st = fs.lstat(path)
		if st then assert(st.type == "dir", "Unsafe extraction directory") else assert(fs.mkdir(path, "700")) end
	end
	local ok, err = pcall(function()
		for _, entry in ipairs(info.entries) do
			local output
			if destination then
				local parent = destination
				for part in entry.name:gmatch("([^/]+)/") do parent = parent .. "/" .. part; mkdir(parent) end
				if entry.directory then mkdir(destination .. "/" .. entry.name)
				else
					assert(not fs.lstat(destination .. "/" .. entry.name), "Duplicate extraction path")
					output = assert(io.open(destination .. "/" .. entry.name, "wb"))
				end
			end
			local copied, failure = pcall(function()
				assert(f:seek("set", entry.offset))
				local remaining, crc = entry.size, 0
				while remaining > 0 do
					local block = assert(f:read(math.min(65536, remaining)), "Truncated ZIP data")
					remaining = remaining - #block
					crc = crc32(block, crc)
					if output then assert(output:write(block)) end
				end
				assert(crc % 4294967296 == entry.crc, "ZIP checksum verification failed")
			end)
			if output then assert(output:close(), "Cannot write restored file") end
			if not copied then error(failure, 0) end
		end
		if destination then
			for i = #info.entries, 1, -1 do
				local entry = info.entries[i]
				assert(fs.chmod(destination .. "/" .. entry.name, string.format("%03o", entry.mode)))
				local timestamp = os.time({year = 1980 + math.floor(entry.date / 512), month = math.floor(entry.date / 32) % 16,
					day = entry.date % 32, hour = math.floor(entry.time / 2048), min = math.floor(entry.time / 32) % 64, sec = (entry.time % 32) * 2})
				if timestamp then fs.utimes(destination .. "/" .. entry.name, timestamp, timestamp) end
			end
		end
	end)
	f:close()
	if not ok then error(err, 0) end
end

return M
