package generator

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/parser"
)

type daeTemplateBlock struct {
	name  string
	start int
	open  int
	close int
	end   int
}

// ValidateDAETemplate checks the required top-level blocks in a complete template.
func ValidateDAETemplate(target model.ClientTarget, template []byte) error {
	if target != model.ClientDAE && target != model.ClientHonk {
		return fmt.Errorf("配置模板仅支持 dae 和 Honk")
	}
	if len(template) == 0 || !utf8.Valid(template) || strings.ContainsRune(string(template), '\x00') {
		return fmt.Errorf("配置模板为空或不是有效文本")
	}
	blocks, err := daeTemplateBlocks(string(template))
	if err != nil {
		return fmt.Errorf("配置模板结构无效")
	}
	counts := make(map[string]int)
	for _, block := range blocks {
		counts[block.name]++
	}
	for _, name := range []string{"global", "dns", "group", "routing", "subscription"} {
		if counts[name] != 1 {
			return fmt.Errorf("配置模板缺少唯一的顶层 %s 块", name)
		}
	}
	if target == model.ClientHonk && counts["assets"] != 1 {
		return fmt.Errorf("Honk 模板必须包含唯一的顶层 assets 块")
	}
	if counts["node"] > 1 {
		return fmt.Errorf("配置模板包含多个顶层 node 块")
	}
	return nil
}

// PrepareDAETemplate validates a complete dae-family template, injects the
// selected nodes, and returns a digest bound to the exact template bytes.
func PrepareDAETemplate(opts Options, templateID string, template []byte) (string, PreflightResult) {
	unsupported := func(code, location, message string) (string, PreflightResult) {
		return "", PreflightResult{
			Status:  PreflightUnsupported,
			Issues:  []PreflightIssue{{Code: code, Severity: "blocking", Location: location, Message: message}},
			Planned: []PreflightItem{},
		}
	}
	target := opts.Target
	if err := ValidateDAETemplate(target, template); err != nil {
		return unsupported("template_structure", "template", err.Error())
	}
	blocks, _ := daeTemplateBlocks(string(template))
	var nodeBlock, subscriptionBlock daeTemplateBlock
	for _, block := range blocks {
		if block.name == "node" {
			nodeBlock = block
		}
		if block.name == "subscription" {
			subscriptionBlock = block
		}
	}
	filtered := FilterNodes(opts.Nodes, opts.Protocols)
	if len(filtered) == 0 && len(opts.DAESubscriptions) == 0 {
		return unsupported("nodes_empty", "nodes", "严格导出至少需要一个已选择的节点")
	}
	links := make([]string, 0, len(filtered))
	names := make(map[string]bool, len(filtered))
	items := make([]PreflightItem, 0, len(filtered)+1)
	for i, node := range filtered {
		if !SupportsProtocol(target, node.Kind) {
			return unsupported("node_protocol", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("%s 不支持节点协议 %s", target.Name(), node.Kind))
		}
		if names[node.Name] {
			return unsupported("node_name_duplicate", fmt.Sprintf("nodes[%d]", i), "所选节点存在重复名称，无法保证模板分组匹配唯一节点")
		}
		names[node.Name] = true
		link := Link(node)
		parsed := parser.ParseURI(link, "")
		if parsed == nil || parsed.Name != node.Name {
			copyNode := node
			copyNode.RawURI = ""
			link = Link(copyNode)
			parsed = parser.ParseURI(link, "")
		}
		if parsed == nil || parsed.Name != node.Name {
			return unsupported("node_name", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 的名称无法保留在 dae URI 中", node.Name))
		}
		if strings.Contains(link, `\`) {
			escaped := strings.ReplaceAll(link, `\`, "%5C")
			escapedNode := parser.ParseURI(escaped, "")
			if escapedNode == nil || escapedNode.Name != node.Name || escapedNode.Kind != node.Kind {
				return unsupported("node_uri", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 的反斜杠无法安全保留在 dae URI 中", node.Name))
			}
			link = escaped
		}
		if strings.Contains(link, `\`) || !validDAENodeURI(node, link) {
			return unsupported("node_uri", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 无法转换为安全的 dae URI", node.Name))
		}
		links = append(links, link)
		items = append(items, PreflightItem{Kind: "node", Name: node.Name, Location: fmt.Sprintf("nodes[%d]", i)})
	}
	for i, sub := range opts.DAESubscriptions {
		u, err := url.Parse(strings.TrimSpace(sub.URL))
		if strings.TrimSpace(sub.Tag) == "" || !daeSubscriptionURL(sub.URL) || err != nil || u.Scheme != "http" && u.Scheme != "https" {
			return unsupported("subscription", fmt.Sprintf("subscriptions[%d]", i), "机场订阅缺少有效的 HTTP(S) 地址或标签")
		}
		if strings.ContainsAny(sub.UserAgent, "'\"\r\n") {
			return unsupported("subscription", fmt.Sprintf("subscriptions[%d]", i), "机场订阅 User-Agent 无法安全写入配置")
		}
		items = append(items, PreflightItem{Kind: "subscription", Name: sub.Tag, Location: fmt.Sprintf("subscriptions[%d]", i)})
	}

	content := string(template)
	if len(links) > 0 {
		if nodeBlock.open > 0 {
			content = content[:nodeBlock.open+1] + "\n" + renderDAETemplateNodes(links) + content[nodeBlock.close:]
		} else {
			nodeBlockText := "node {\n" + renderDAETemplateNodes(links) + "}\n\n"
			content = content[:subscriptionBlock.start] + nodeBlockText + content[subscriptionBlock.start:]
		}
	} else if nodeBlock.open > 0 {
		content = content[:nodeBlock.start] + content[nodeBlock.end:]
	}
	var found bool
	subscriptionBlock, found = findDAETemplateBlock(content, "subscription")
	if !found {
		return unsupported("template_structure", "subscription", "渲染节点后无法定位顶层 subscription 块")
	}
	if len(opts.DAESubscriptions) > 0 {
		content = content[:subscriptionBlock.open+1] + "\n" + renderDAETemplateSubscriptions(target, opts.DAESubscriptions) + content[subscriptionBlock.close:]
	} else {
		content = content[:subscriptionBlock.start] + content[subscriptionBlock.end:]
	}
	items = append([]PreflightItem{{Kind: "config", Name: "config.dae", Location: "template"}}, items...)
	result := PreflightResult{
		Status:       PreflightExact,
		TargetPolicy: "tower-kenzo-dae-template-v1",
		PolicyNote:   "机场保留完整订阅，手动节点写入 node {}",
		Planned:      items,
	}
	if target == model.ClientHonk {
		result.TargetPolicy = "tower-kenzo-honk-template-v1"
	}
	templateHash := sha256.Sum256(template)
	type nodeDigest struct {
		Name string
		Kind model.ProxyKind
		URI  string
	}
	type subscriptionDigest struct {
		Tag       string
		URLHash   string
		UserAgent string
		NodeNames []string
	}
	nodeDigests := make([]nodeDigest, 0, len(filtered))
	for i, node := range filtered {
		uriHash := sha256.Sum256([]byte(links[i]))
		nodeDigests = append(nodeDigests, nodeDigest{Name: node.Name, Kind: node.Kind, URI: hex.EncodeToString(uriHash[:])})
	}
	subscriptionDigests := make([]subscriptionDigest, 0, len(opts.DAESubscriptions))
	for _, sub := range opts.DAESubscriptions {
		urlHash := sha256.Sum256([]byte(sub.URL))
		subscriptionDigests = append(subscriptionDigests, subscriptionDigest{
			Tag: sub.Tag, URLHash: hex.EncodeToString(urlHash[:]), UserAgent: sub.UserAgent, NodeNames: sub.NodeNames,
		})
	}
	payload, err := json.Marshal(struct {
		Target        model.ClientTarget
		TemplateID    string
		TemplateHash  string
		Nodes         []nodeDigest
		Subscriptions []subscriptionDigest
	}{target, templateID, hex.EncodeToString(templateHash[:]), nodeDigests, subscriptionDigests})
	if err != nil {
		return unsupported("plan_digest", "template", "无法生成配置计划摘要")
	}
	digest := sha256.Sum256(payload)
	result.PlanDigest = hex.EncodeToString(digest[:])
	return content, result
}

func renderDAETemplateNodes(links []string) string {
	var b strings.Builder
	for _, link := range links {
		b.WriteString("    '")
		b.WriteString(link)
		b.WriteString("'\n")
	}
	return b.String()
}

func renderDAETemplateSubscriptions(target model.ClientTarget, subscriptions []DAESubscription) string {
	var b strings.Builder
	for _, sub := range subscriptions {
		if target == model.ClientHonk {
			b.WriteString("    " + sub.Tag + ": '" + sub.URL + "' {\n")
			if sub.UserAgent != "" {
				b.WriteString("        ua: '" + sub.UserAgent + "'\n")
			}
			b.WriteString("        route: direct\n    }\n")
			continue
		}
		b.WriteString("    " + sub.Tag + ": '" + sub.URL + "'\n")
	}
	return b.String()
}

func findDAETemplateBlock(content, name string) (daeTemplateBlock, bool) {
	blocks, err := daeTemplateBlocks(content)
	if err != nil {
		return daeTemplateBlock{}, false
	}
	for _, block := range blocks {
		if block.name == name {
			return block, true
		}
	}
	return daeTemplateBlock{}, false
}

func daeTemplateBlocks(content string) ([]daeTemplateBlock, error) {
	blocks := make([]daeTemplateBlock, 0)
	for i := 0; i < len(content); {
		if isDAEConfigSpace(content[i]) {
			i++
			continue
		}
		if content[i] == '#' {
			i = skipDAEConfigLine(content, i)
			continue
		}
		if content[i] == '\'' || content[i] == '"' {
			end, err := skipDAEConfigQuote(content, i)
			if err != nil {
				return nil, err
			}
			i = end
			continue
		}
		if content[i] == '}' {
			return nil, fmt.Errorf("unexpected closing brace")
		}
		if !isDAEConfigIdentStart(content[i]) {
			if content[i] == '{' {
				return nil, fmt.Errorf("block without name")
			}
			i++
			continue
		}
		start := i
		i++
		for i < len(content) && isDAEConfigIdent(content[i]) {
			i++
		}
		name := content[start:i]
		j := i
		for j < len(content) && isDAEConfigSpace(content[j]) {
			j++
		}
		if j >= len(content) || content[j] != '{' {
			continue
		}
		close, err := findDAEConfigBlockEnd(content, j)
		if err != nil {
			return nil, err
		}
		blocks = append(blocks, daeTemplateBlock{name: name, start: start, open: j, close: close, end: close + 1})
		i = close + 1
	}
	return blocks, nil
}

func findDAEConfigBlockEnd(content string, open int) (int, error) {
	depth := 1
	for i := open + 1; i < len(content); {
		switch content[i] {
		case '#':
			i = skipDAEConfigLine(content, i)
		case '\'', '"':
			end, err := skipDAEConfigQuote(content, i)
			if err != nil {
				return 0, err
			}
			i = end
		case '{':
			depth++
			i++
		case '}':
			depth--
			if depth == 0 {
				return i, nil
			}
			i++
		default:
			i++
		}
	}
	return 0, fmt.Errorf("unclosed block")
}

func skipDAEConfigQuote(content string, start int) (int, error) {
	quote := content[start]
	for i := start + 1; i < len(content); i++ {
		if content[i] == '\\' {
			i++
			continue
		}
		if content[i] == quote {
			return i + 1, nil
		}
	}
	return 0, fmt.Errorf("unclosed quoted string")
}

func skipDAEConfigLine(content string, start int) int {
	for start < len(content) && content[start] != '\n' {
		start++
	}
	return start
}

func isDAEConfigSpace(value byte) bool {
	return value == ' ' || value == '\t' || value == '\r' || value == '\n'
}

func isDAEConfigIdentStart(value byte) bool {
	return value >= 'a' && value <= 'z' || value >= 'A' && value <= 'Z' || value == '_'
}

func isDAEConfigIdent(value byte) bool {
	return isDAEConfigIdentStart(value) || value >= '0' && value <= '9' || value == '-'
}
