"use strict";
"require baseclass";
"require ui";
return baseclass.extend({
  __init__: function () {
    ui.menu.load().then(L.bind(this.render, this));
  },
  render: function (tree) {
    var node = tree,
      url = "";
    this.renderModeMenu(node);
    if (L.env.dispatchpath.length >= 3) {
      for (var i = 0; i < 3 && node; i++) {
        node = node.children[L.env.dispatchpath[i]];
        url = url + (url ? "/" : "") + L.env.dispatchpath[i];
      }
      if (node) this.renderTabMenu(node, url);
    }
    document
      .querySelector(".showSide")
      .addEventListener(
        "click",
        ui.createHandlerFn(this, "handleSidebarToggle")
      );
    document
      .querySelector(".darkMask")
      .addEventListener(
        "click",
        ui.createHandlerFn(this, "handleSidebarToggle")
      );
    document.querySelector(".main > .loading").style.opacity = "0";
    document.querySelector(".main > .loading").style.visibility = "hidden";
    if (window.innerWidth <= 1152) {
      document.querySelector(".main-left").style.transform = "translateX(-20rem)";
    }
    window.addEventListener("resize", this.handleSidebarToggle, true);
  },
  handleMenuExpand: function (ev) {
    var a = ev.target,
      ul1 = a.parentNode,
      ul2 = a.nextElementSibling,
      isActive = ul1.classList.contains("active");
    document.querySelectorAll("li.slide.active").forEach(function (li) {
      if (li !== a.parentNode || li == ul1) {
        var menu = li.querySelector("ul");
        if (menu) {
          if (!menu.style.maxHeight || menu.style.maxHeight === "1200px") {
            menu.style.maxHeight = menu.scrollHeight + "px";
          }
          void menu.offsetHeight; // Force layout
          menu.style.maxHeight = "0px";
        }
        li.classList.remove("active");
        li.childNodes[0].classList.remove("active");
      }
      if (li == ul1) return;
    });
    if (!ul2) return;
    if (!isActive) {
      if (
        ul2.parentNode.offsetLeft + ul2.offsetWidth <=
        ul1.offsetLeft + ul1.offsetWidth
      )
        ul2.classList.add("align-left");
      ul1.classList.add("active");
      a.classList.add("active");
      ul2.style.maxHeight = ul2.scrollHeight + "px";
    }
    a.blur();
    ev.preventDefault();
    ev.stopPropagation();
  },
  renderMainMenu: function (tree, url, level) {
    var l = (level || 0) + 1,
      ul = E("ul", { class: level ? "slide-menu" : "nav" }),
      children = ui.menu.getChildren(tree);
    if (children.length == 0 || l > 2) return E([]);
    for (var i = 0; i < children.length; i++) {
      var isActive = L.env.dispatchpath[l] == children[i].name,
        submenu = this.renderMainMenu(
          children[i],
          url + "/" + children[i].name,
          l
        ),
        hasChildren = submenu.children.length;
      ul.appendChild(
        E(
          "li",
          {
            class: hasChildren
              ? "slide" + (isActive ? " active" : "")
              : isActive
              ? " active"
              : "",
          },
          [
            E(
              "a",
              {
                href: hasChildren ? "#" : L.url(url, children[i].name),
                class: hasChildren
                  ? "menu" + (isActive ? " active" : "")
                  : null,
                click: hasChildren
                  ? ui.createHandlerFn(this, "handleMenuExpand")
                  : null,
                "data-title": hasChildren
                  ? children[i].title
                  : _(children[i].title),
              },
              [_(children[i].title)]
            ),
            submenu,
          ]
        )
      );
    }
    if (l == 1) {
      var container = document.querySelector("#mainmenu");
      container.appendChild(ul);
      container.style.display = "";
    }
    return ul;
  },
  renderModeMenu: function (tree) {
    var ul = document.querySelector("#modemenu"),
      children = ui.menu.getChildren(tree);
    for (var i = 0; i < children.length; i++) {
      var isActive = L.env.requestpath.length
        ? children[i].name == L.env.requestpath[0]
        : i == 0;
      ul.appendChild(
        E("li", {}, [
          E(
            "a",
            {
              href: L.url(children[i].name),
              class: isActive ? "active" : null,
            },
            [_(children[i].title)]
          ),
        ])
      );
      if (isActive) this.renderMainMenu(children[i], children[i].name);
      if (i > 0 && i < children.length)
        ul.appendChild(E("li", { class: "divider" }, [E("span")]));
    }
    if (children.length > 1) ul.parentElement.style.display = "";
  },
  renderTabMenu: function (tree, url, level) {
    var container = document.querySelector("#tabmenu"),
      l = (level || 0) + 1,
      ul = E("ul", { class: "tabs" }),
      children = ui.menu.getChildren(tree),
      activeNode = null;
    if (children.length == 0) return E([]);
    for (var i = 0; i < children.length; i++) {
      var isActive = L.env.dispatchpath[l + 2] == children[i].name,
        activeClass = isActive ? " active" : "",
        className = "tabmenu-item-%s %s".format(children[i].name, activeClass);
      ul.appendChild(
        E("li", { class: className }, [
          E("a", { href: L.url(url, children[i].name) }, [
            _(children[i].title),
          ]),
        ])
      );
      if (isActive) activeNode = children[i];
    }
    container.appendChild(ul);
    container.style.display = "";
    if (activeNode)
      container.appendChild(
        this.renderTabMenu(activeNode, url + "/" + activeNode.name, l)
      );
    return ul;
  },
  handleSidebarToggle: function (ev) {
    var width = window.innerWidth,
      darkMask = document.querySelector(".darkMask"),
      mainRight = document.querySelector(".main-right"),
      mainLeft = document.querySelector(".main-left"),
      open = mainLeft.style.transform === ""; // true if currently open
    
    // If it's a resize event, we simulate that the sidebar was "open" so the logic below closes it for mobile, and opens it for desktop
    if (ev.type == "resize") {
        open = true;
    }
    
    // Logics: 'open' true means we want to CLOSE it on mobile, but OPEN it on desktop.
    // Actually, let's make it clearer: we toggle the state.
    var willOpen = !open;
    if (ev.type == "resize") {
        willOpen = width > 1152;
    }

    if (width <= 1152) {
        // Mobile behavior
        mainLeft.style.width = ""; // Reset width
        mainLeft.style.transform = willOpen ? "" : "translateX(-20rem)";
        mainLeft.style.visibility = willOpen ? "visible" : "";
        darkMask.style.visibility = willOpen ? "visible" : "";
        darkMask.style.opacity = willOpen ? 1 : "";
        mainRight.style.width = "";
    } else {
        // Desktop behavior
        mainLeft.style.width = ""; // Reset width
        mainLeft.style.transform = willOpen ? "" : "translateX(-20rem)";
        mainLeft.style.visibility = willOpen ? "visible" : "hidden";
        mainRight.style.width = willOpen ? "" : "100%";
        darkMask.style.visibility = "";
        darkMask.style.opacity = "";
    }
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();
  },
});
