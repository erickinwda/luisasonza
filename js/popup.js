document.addEventListener("DOMContentLoaded", function () {
  const popup = document.getElementById("popupOverlay");
  const closeButton = document.getElementById("closePopup");
  const socialLinks = document.querySelectorAll(".social-link");
  // Add globe icon selector
  const globeIcon = document.querySelector(
    ".navbar svg[viewBox='0 0 30 30.000001']"
  );

  function openPopup() {
    if (window.innerWidth <= 768) {
      // Só abre em telas mobile
      popup.classList.add("active");
      document.body.classList.add("popup-active");
    }
  }

  function closePopup() {
    popup.classList.remove("active");
    document.body.classList.remove("popup-active");
  }

  // Event Listeners
  socialLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      openPopup();
    });
  });

  // Add click event for globe icon
  if (globeIcon) {
    globeIcon.parentElement.addEventListener("click", function (e) {
      e.preventDefault();
      openPopup();
    });
  }

  closeButton.addEventListener("click", closePopup);

  // Fecha o popup ao clicar fora dele
  popup.addEventListener("click", function (e) {
    if (e.target === popup) {
      closePopup();
    }
  });

  // Fecha o popup com a tecla ESC
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && popup.classList.contains("active")) {
      closePopup();
    }
  });
});
