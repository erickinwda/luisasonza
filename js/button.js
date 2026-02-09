(() => {
  const subscriptionButton = document.querySelector(".subscription-button");
  const buttonOffset =
    subscriptionButton.getBoundingClientRect().top + window.scrollY;
  let isFixed = false;

  // Configura a transição de opacidade
  subscriptionButton.style.transition = "opacity 0.3s ease-in-out";

  const onScroll = () => {
    const shouldBeFixed = window.scrollY > buttonOffset;

    if (shouldBeFixed && !isFixed) {
      // Aplica fade-out antes de fixar
      subscriptionButton.style.opacity = "0";

      setTimeout(() => {
        // Aplica estilos fixos e fade-in
        Object.assign(subscriptionButton.style, {
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "90%",
          maxWidth: "1200px",
          zIndex: "999",
          margin: "0",
          borderRadius: "9999px",
          opacity: "1", // Fade-in ao fixar
        });
        isFixed = true;
      }, 300); // Tempo do fade-out
    } else if (!shouldBeFixed && isFixed) {
      // Aplica fade-out antes de restaurar posição original
      subscriptionButton.style.opacity = "0";

      setTimeout(() => {
        // Remove estilos fixos e aplica fade-in
        Object.assign(subscriptionButton.style, {
          position: "",
          bottom: "",
          left: "",
          transform: "",
          width: "",
          maxWidth: "",
          zIndex: "",
          margin: "",
          borderRadius: "",
          opacity: "1", // Fade-in ao restaurar
        });
        isFixed = false;
      }, 300); // Tempo do fade-out
    }
  };

  window.addEventListener("scroll", onScroll);
})();
