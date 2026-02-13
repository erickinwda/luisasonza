// Verifica se o evento já foi disparado
if (!sessionStorage.getItem('event_sent')) {
  // Se o evento não foi disparado, envie o evento via CAPI ou Pixel
  fetch('/path/to/your/api', {  // Use a URL correta para o envio via API
    method: 'POST',
    body: JSON.stringify({
      event_name: 'PageView',
      event_time: Math.floor(Date.now() / 1000),
      // outros dados necessários
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Marca o evento como enviado na sessão
  sessionStorage.setItem('event_sent', 'true');
}
