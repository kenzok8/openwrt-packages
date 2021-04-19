f = SimpleForm("serverchand")
f.reset = false
f.submit = false
f:append(Template("serverchand/log"))
return f
