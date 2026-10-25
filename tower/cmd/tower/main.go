// Command tower is the OpenWrt backend for the luci-app-tower plugin.
//
// With no subcommand it runs the HTTP daemon; with a subcommand it acts as a
// CLI, so the LuCI frontend can drive the same logic through subprocess calls.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/kenzok8/tower/internal/api"
	"github.com/kenzok8/tower/internal/generator"
	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/service"
	"github.com/kenzok8/tower/internal/store"
)

func main() {
	dataDir := flag.String("data", "/etc/tower", "data directory for persistent state")
	listen := flag.String("listen", "127.0.0.1:7443", "HTTP listen address (daemon mode)")
	flag.Parse()

	st := store.New(*dataDir)
	svc := service.New(st)

	if flag.NArg() == 0 {
		runDaemon(*listen, svc)
		return
	}

	sub := flag.Arg(0)
	args := flag.Args()[1:]
	if err := runCLI(sub, args, svc, *listen); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func runDaemon(listen string, svc *service.Service) {
	if !loopbackListen(listen) {
		log.Fatal("tower API must listen on loopback")
	}
	if err := svc.Store.Prepare(); err != nil {
		log.Fatal(err)
	}
	srv := api.New(svc)
	log.Printf("tower daemon listening on %s (data: %s)", listen, svc.Store.Dir())
	if err := http.ListenAndServe(listen, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}

func loopbackListen(listen string) bool {
	host, _, err := net.SplitHostPort(listen)
	if err != nil {
		return false
	}
	return host == "localhost" || net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback()
}

func runCLI(sub string, args []string, svc *service.Service, listen string) error {
	switch sub {
	case "subscriptions":
		state, err := svc.Store.Load()
		if err != nil {
			return err
		}
		return printJSON(state.Subscriptions)
	case "nodes":
		nodes, err := svc.Nodes()
		if err != nil {
			return err
		}
		return printJSON(nodes)
	case "update_node":
		fs := flag.NewFlagSet("update_node", flag.ExitOnError)
		file := fs.String("file", "", "path to the node JSON file")
		_ = fs.Parse(args)
		if *file == "" {
			return fmt.Errorf("node file is required")
		}
		content, err := os.ReadFile(*file)
		if err != nil {
			return err
		}
		var node model.ProxyNode
		if err := json.Unmarshal(content, &node); err != nil {
			return fmt.Errorf("invalid node JSON: %w", err)
		}
		return svc.UpdateOwnedNode(node)
	case "remove_node":
		fs := flag.NewFlagSet("remove_node", flag.ExitOnError)
		id := fs.String("id", "", "node id")
		_ = fs.Parse(args)
		return svc.RemoveOwnedNode(*id)
	case "add":
		fs := flag.NewFlagSet("add", flag.ExitOnError)
		name := fs.String("name", "", "subscription name")
		url := fs.String("url", "", "subscription URL")
		ua := fs.String("user-agent", "", "optional User-Agent")
		_ = fs.Parse(args)
		sub, err := svc.AddSubscription(*name, *url, *ua)
		if err != nil {
			return err
		}
		return printJSON(sub)
	case "remove":
		fs := flag.NewFlagSet("remove", flag.ExitOnError)
		id := fs.String("id", "", "subscription id")
		_ = fs.Parse(args)
		return svc.RemoveSubscription(*id)
	case "refresh":
		fs := flag.NewFlagSet("refresh", flag.ExitOnError)
		id := fs.String("id", "", "subscription id (empty = all)")
		_ = fs.Parse(args)
		results, err := svc.Refresh(*id)
		if err != nil {
			return err
		}
		return printJSON(results)
	case "import":
		fs := flag.NewFlagSet("import", flag.ExitOnError)
		file := fs.String("file", "", "path to the config file to import")
		_ = fs.Parse(args)
		var content []byte
		var err error
		if *file != "" {
			content, err = os.ReadFile(*file)
		} else {
			content, err = io.ReadAll(os.Stdin)
		}
		if err != nil {
			return err
		}
		n, err := svc.ImportNodes(string(content))
		if err != nil {
			return err
		}
		fmt.Println(n)
		return nil
	case "export":
		fs := flag.NewFlagSet("export", flag.ExitOnError)
		target := fs.String("target", "", "client target")
		protocols := fs.String("protocols", "", "comma-separated enabled protocols (empty = all)")
		nodes := fs.String("nodes", "", "comma-separated node ids (empty = all)")
		scheme := fs.String("scheme", "", "rule scheme id (empty = built-in fallback)")
		preferRuleSets := fs.Bool("prefer-rule-sets", true, "prefer native remote rule sets when supported")
		planDigest := fs.String("plan-digest", "", "digest from preflight for degraded exports")
		serviceRegionsJSON := fs.String("service-regions", "", "JSON service-to-country map for target-specific routing")
		acceptedDegradations := fs.String("accept-degradations", "", "comma-separated preflight warning IDs")
		strict := fs.Bool("strict", false, "require explicit nodes and an exact preflight digest")
		_ = fs.Parse(args)
		serviceRegions, err := parseServiceRegions(*serviceRegionsJSON)
		if err != nil {
			return err
		}
		if len(serviceRegions) != 0 && !*strict {
			return fmt.Errorf("service-regions requires --strict")
		}
		var out string
		if *strict {
			out, err = svc.ExportStrictWithServiceRegions(model.ClientTarget(*target), service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, *planDigest, serviceRegions)
		} else {
			out, err = svc.ExportWithConsent(model.ClientTarget(*target), service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, *planDigest, service.ParseNodeIDs(*acceptedDegradations))
		}
		if err != nil {
			return err
		}
		fmt.Print(out)
		return nil
	case "export_begin":
		fs := flag.NewFlagSet("export_begin", flag.ExitOnError)
		target := fs.String("target", "", "client target")
		protocols := fs.String("protocols", "", "comma-separated enabled protocols (empty = all)")
		nodes := fs.String("nodes", "", "comma-separated node ids (empty = all)")
		scheme := fs.String("scheme", "", "rule scheme id (empty = built-in fallback)")
		preferRuleSets := fs.Bool("prefer-rule-sets", true, "prefer native remote rule sets when supported")
		planDigest := fs.String("plan-digest", "", "digest from preflight for degraded exports")
		serviceRegionsJSON := fs.String("service-regions", "", "JSON service-to-country map for target-specific routing")
		acceptedDegradations := fs.String("accept-degradations", "", "comma-separated preflight warning IDs")
		strict := fs.Bool("strict", false, "require explicit nodes and an exact preflight digest")
		_ = fs.Parse(args)
		serviceRegions, err := parseServiceRegions(*serviceRegionsJSON)
		if err != nil {
			return err
		}
		if len(serviceRegions) != 0 && !*strict {
			return fmt.Errorf("service-regions requires --strict")
		}
		if *target == "" {
			return fmt.Errorf("target is required")
		}
		var result service.ExportBeginResult
		if *strict {
			result, err = svc.BeginExportStrictWithServiceRegions(model.ClientTarget(*target), service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, *planDigest, serviceRegions)
		} else {
			result, err = svc.BeginExport(model.ClientTarget(*target), service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, *planDigest, service.ParseNodeIDs(*acceptedDegradations))
		}
		if err != nil {
			return err
		}
		return printJSON(result)
	case "export_read":
		fs := flag.NewFlagSet("export_read", flag.ExitOnError)
		id := fs.String("id", "", "export id")
		offset := fs.Int("offset", 0, "byte offset")
		_ = fs.Parse(args)
		result, err := svc.ReadExport(*id, *offset)
		if err != nil {
			return err
		}
		return printJSON(result)
	case "export_discard":
		fs := flag.NewFlagSet("export_discard", flag.ExitOnError)
		id := fs.String("id", "", "export id")
		_ = fs.Parse(args)
		if err := svc.DiscardExport(*id); err != nil {
			return err
		}
		return printJSON(struct {
			Success bool `json:"success"`
		}{Success: true})
	case "preflight_export":
		fs := flag.NewFlagSet("preflight_export", flag.ExitOnError)
		target := fs.String("target", "", "client target")
		protocols := fs.String("protocols", "", "comma-separated enabled protocols (empty = all)")
		nodes := fs.String("nodes", "", "comma-separated node ids (empty = all)")
		scheme := fs.String("scheme", "", "rule scheme id (empty = built-in fallback)")
		preferRuleSets := fs.Bool("prefer-rule-sets", true, "prefer native remote rule sets when supported")
		serviceRegionsJSON := fs.String("service-regions", "", "JSON service-to-country map for target-specific routing")
		strict := fs.Bool("strict", false, "require explicit nodes and return exact plans only")
		_ = fs.Parse(args)
		serviceRegions, err := parseServiceRegions(*serviceRegionsJSON)
		if err != nil {
			return err
		}
		if len(serviceRegions) != 0 && !*strict {
			return fmt.Errorf("service-regions requires --strict")
		}
		if *target == "" {
			return fmt.Errorf("target is required")
		}
		var result generator.PreflightResult
		if *strict {
			result, err = svc.PreflightExportStrictWithServiceRegions(model.ClientTarget(*target), service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, serviceRegions)
		} else {
			result, err = svc.PreflightExportWithOptions(model.ClientTarget(*target), service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets)
		}
		if err != nil {
			return err
		}
		return printJSON(result)
	case "schemes":
		results, err := svc.SchemeSummaries()
		if err != nil {
			return err
		}
		return printJSON(results)
	case "capabilities":
		return printJSON(generator.TargetCapabilities())
	case "scheme":
		fs := flag.NewFlagSet("scheme", flag.ExitOnError)
		id := fs.String("id", "", "scheme id")
		_ = fs.Parse(args)
		scheme, err := svc.Scheme(*id)
		if err != nil {
			return err
		}
		return printJSON(scheme)
	case "add_scheme":
		fs := flag.NewFlagSet("add_scheme", flag.ExitOnError)
		name := fs.String("name", "", "scheme name")
		file := fs.String("file", "", "path to the rule config file")
		url := fs.String("url", "", "source URL")
		_ = fs.Parse(args)
		var scheme model.RuleScheme
		var err error
		if *file != "" {
			content, readErr := os.ReadFile(*file)
			if readErr != nil {
				return readErr
			}
			scheme, err = svc.AddScheme(*name, string(content), *url)
		} else if *url != "" {
			scheme, err = svc.AddSchemeFromURL(*name, *url)
		} else {
			content, readErr := io.ReadAll(os.Stdin)
			if readErr != nil {
				return readErr
			}
			scheme, err = svc.AddScheme(*name, string(content), "")
		}
		if err != nil {
			return err
		}
		summaries, err := svc.SchemeSummaries()
		if err != nil {
			return err
		}
		for _, summary := range summaries {
			if summary.ID == scheme.ID {
				return printJSON(summary)
			}
		}
		return fmt.Errorf("imported scheme missing from summary")
	case "refresh_scheme":
		fs := flag.NewFlagSet("refresh_scheme", flag.ExitOnError)
		id := fs.String("id", "", "scheme id")
		_ = fs.Parse(args)
		updated, failed, err := svc.RefreshSchemeRulesets(*id)
		if err != nil {
			return err
		}
		return printJSON(map[string]int{"updated": updated, "failed": failed})
	case "remove_scheme":
		fs := flag.NewFlagSet("remove_scheme", flag.ExitOnError)
		id := fs.String("id", "", "scheme id")
		_ = fs.Parse(args)
		return svc.RemoveScheme(*id)
	case "rename_scheme":
		fs := flag.NewFlagSet("rename_scheme", flag.ExitOnError)
		id := fs.String("id", "", "scheme id")
		name := fs.String("name", "", "new scheme name")
		_ = fs.Parse(args)
		return svc.RenameScheme(*id, *name)
	case "links":
		fs := flag.NewFlagSet("links", flag.ExitOnError)
		protocols := fs.String("protocols", "", "comma-separated enabled protocols (empty = all)")
		nodes := fs.String("nodes", "", "comma-separated node ids (empty = all)")
		_ = fs.Parse(args)
		results, err := svc.Links(service.ParseProtocols(*protocols), service.ParseNodeIDs(*nodes))
		if err != nil {
			return err
		}
		return printJSON(results)
	case "share_create":
		if !loopbackListen(listen) {
			return fmt.Errorf("tower API must listen on loopback")
		}
		fs := flag.NewFlagSet("share_create", flag.ExitOnError)
		destination := fs.String("destination", "", "export destination")
		nodes := fs.String("nodes", "", "comma-separated node ids")
		scheme := fs.String("scheme", "", "rule scheme id")
		preferRuleSets := fs.Bool("prefer-rule-sets", true, "prefer native remote rule sets")
		planDigest := fs.String("plan-digest", "", "digest from preflight for degraded exports")
		serviceRegionsJSON := fs.String("service-regions", "", "JSON service-to-country map for target-specific routing")
		acceptedDegradations := fs.String("accept-degradations", "", "comma-separated preflight warning IDs")
		strict := fs.Bool("strict", false, "require explicit nodes and an exact preflight digest")
		_ = fs.Parse(args)
		serviceRegions, err := parseServiceRegions(*serviceRegionsJSON)
		if err != nil {
			return err
		}
		if len(serviceRegions) != 0 && !*strict {
			return fmt.Errorf("service-regions requires --strict")
		}
		if *destination == "" {
			return fmt.Errorf("destination is required")
		}
		var result service.ShareResult
		if *strict {
			result, err = svc.CreateLocalShareStrictWithServiceRegions(*destination, service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, *planDigest, serviceRegions)
		} else {
			result, err = svc.CreateLocalShareWithConsent(*destination, service.ParseNodeIDs(*nodes), *scheme, *preferRuleSets, *planDigest, service.ParseNodeIDs(*acceptedDegradations))
		}
		if err != nil {
			return err
		}
		_, port, _ := net.SplitHostPort(listen)
		return printJSON(map[string]any{
			"url":      "http://127.0.0.1:" + port + "/share/v1/" + result.Token,
			"included": result.Included,
			"skipped":  result.Skipped,
		})
	case "share_revoke":
		return svc.RevokeLocalShare()
	default:
		return fmt.Errorf("unknown subcommand %q", sub)
	}
}

func printJSON(v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(b))
	return nil
}

func parseServiceRegions(raw string) (map[string]string, error) {
	if raw == "" {
		return nil, nil
	}
	regions := make(map[string]string)
	if err := json.Unmarshal([]byte(raw), &regions); err != nil || regions == nil {
		return nil, fmt.Errorf("service-regions must be a JSON object")
	}
	return regions, nil
}
