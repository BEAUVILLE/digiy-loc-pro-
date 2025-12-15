(function(){
  // Active le bouton de navigation selon la page
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll('.nav a').forEach(a=>{
    const href = (a.getAttribute("href")||"").toLowerCase();
    if(href === path) a.classList.add("active");
  });
})();
