# Estado de StockManager

Página de estado publicada fuera de los servidores de la aplicación, para que siga visible aunque ésta no responda.
Se genera cada 10 minutos con `status/build.mjs` (GitHub Actions → GitHub Pages).

Para avisar algo a mano (por ejemplo, "estamos al tanto de una caída"), escribí el texto en `status/mensaje.txt`:
aparece arriba de la página en la próxima actualización.
