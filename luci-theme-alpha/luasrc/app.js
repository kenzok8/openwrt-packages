(function () {
    // your page initialization code here
    // the DOM will be available here
  
    const toggler = document.querySelector(".toggler");
    console.log(toggler);
    toggler.addEventListener(
      "click",
      function (e) {
        const element = document.querySelector(".navbar");
        element.classList.toggle("active");
      },
      false
    );
  
    // const isDark = localStorage.getItem("isDark");
    // if (isDark == 1) {
    //   const element = document.querySelector("body");
    //   element.classList.add("dark");
    // }
    // const themetoggler = document.querySelector(".themetoggler");
    // themetoggler.addEventListener(
    //   "click",
    //   function (e) {
    //     e.preventDefault();
    //     const element = document.querySelector("body");
    //     element.classList.toggle("dark");
  
    //     const isDark = localStorage.getItem("isDark");
    //     localStorage.setItem("isDark", isDark == 1 ? 0 : 1);
    //   },
    //   false
    // );
  })();
  