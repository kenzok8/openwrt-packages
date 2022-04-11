{%

let hijack_ways = o_hijack_ways;
if (hijack_ways == "use_ipset") {
    include("set.uc");
}
include("chain.uc");

%}
