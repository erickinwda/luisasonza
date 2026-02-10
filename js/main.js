document.addEventListener("DOMContentLoaded", () => {
  // Elementos DOM
  const navbar = document.querySelector(".navbar");
  const bioText = document.getElementById("bioText");
  const bioToggle = document.getElementById("bioToggle");
  const toggleBtns = document.querySelectorAll(".toggle-btn");
  const contentSections = document.querySelectorAll(".content-section");
  let lastScroll = 0;

  // Detectar dispositivos iOS
  const isIOS = () => {
    return [
      'iPad Simulator',
      'iPhone Simulator', 
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod'
    ].includes(navigator.platform)
    // iPad no iOS 13+ não aparece como iPad no navigator.platform
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  };

  // Função para inicializar vídeos com fallback para iOS
  function initializeVideos() {
    const videos = document.querySelectorAll('video');
    
    videos.forEach(video => {
      // Garantir atributos necessários para iOS
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      
      // Tentar reproduzir o vídeo
      const playPromise = video.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          // Autoplay funcionou
          console.log('Vídeo iniciou automaticamente');
        }).catch(error => {
          // Autoplay falhou - criar fallback
          console.log('Autoplay falhou, criando fallback:', error);
          createVideoFallback(video);
        });
      } else if (isIOS()) {
        // Para dispositivos iOS mais antigos
        createVideoFallback(video);
      }
    });
  }

  // Criar fallback para vídeos que não conseguem fazer autoplay
  function createVideoFallback(video) {
    // Criar overlay de play se não existir
    if (!video.parentElement.querySelector('.video-play-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'video-play-overlay';
      overlay.innerHTML = '<i class="fas fa-play"></i>';
      overlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
        cursor: pointer;
        z-index: 10;
        transition: all 0.3s ease;
      `;
      
      overlay.addEventListener('click', () => {
        video.play();
        overlay.style.display = 'none';
      });
      
      // Posicionar o container como relativo se necessário
      if (getComputedStyle(video.parentElement).position === 'static') {
        video.parentElement.style.position = 'relative';
      }
      
      video.parentElement.appendChild(overlay);
    }
  }

  // Inicializar vídeos quando a página carregar
  initializeVideos();

  // Re-inicializar vídeos após interações do usuário (para contornar políticas de autoplay)
  let userInteracted = false;
  const enableAutoplayAfterInteraction = () => {
    if (!userInteracted) {
      userInteracted = true;
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.paused) {
          video.play().catch(e => console.log('Erro ao reproduzir vídeo:', e));
        }
        // Remove overlays após primeira interação
        const overlay = video.parentElement.querySelector('.video-play-overlay');
        if (overlay) {
          overlay.style.display = 'none';
        }
      });
    }
  };

  // Eventos de interação do usuário
  ['touchstart', 'click', 'scroll'].forEach(event => {
    document.addEventListener(event, enableAutoplayAfterInteraction, { once: true });
  });

  // Função para alternar a bio
  function toggleBio() {
    const bioText = document.getElementById("bioText");
    const bioToggle = document.getElementById("bioToggle");

    if (bioText.classList.contains("expanded")) {
      bioText.classList.remove("expanded");
      bioToggle.textContent = "Mostrar mais";
      // Scroll suave para a bio se necessário
      bioText.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      bioText.classList.add("expanded");
      bioToggle.textContent = "Mostrar menos";
    }
  }

  // Event listener para o botão de bio
  bioToggle.addEventListener("click", toggleBio);

  // Controle da navbar durante o scroll
  window.addEventListener("scroll", () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > lastScroll && currentScroll > 100) {
      navbar.style.transform = "translateY(-100%)";
    } else {
      navbar.style.transform = "translateY(0)";
    }
    navbar.style.transition = "transform 0.3s ease";
    lastScroll = currentScroll;
  });
});
