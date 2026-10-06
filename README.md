# ¡Uush! — App de seguimiento

App web (PWA) para llevar la partida del juego de cartas de debate **¡Uush!**. La maneja una sola persona, el delegado, desde su celular o PC. Funciona sin internet una vez abierta y se puede instalar como app.

No guarda historial: la partida en curso sobrevive a una recarga accidental, pero se borra al cerrar la pestaña o al empezar una nueva.

## Qué hace

- **Configuración:** modo pareja o grupo (3 a 10 jugadores), niveles en juego, delegado y variante de predicción (pareja).
- **Número de carta:** muestra la categoría, el nivel con su gato y la afirmación. Avisa si el número no existe, si la carta ya salió o si es de un nivel que no está en juego. Las cartas en blanco (220 a 227) piden escribir la afirmación.
- **Votos:** botones por jugador, «todos a favor», «todos en contra» y deshacer.
- **Resultado:** veredicto, quién habla primero, cambios de opinión (con quién convenció) y mejor defensa.
- **Cartas de poder:** las 10 cartas, con su momento de juego. Máximo 2 por jugador y una por ronda. Se ganan automáticamente al convencer o al ganar la mejor defensa. Voto doble, Adivina, Revancha, Veto y Robo cambian el cálculo de verdad.
- **Resumen:** compatibilidad grupal y por pares, «Lo que pasó en la mesa», premios, logros, arquetipos, análisis por categoría, ronda a ronda e imagen para WhatsApp.
- **Protección:** el botón «atrás» del celular abre el menú en vez de sacarte de la partida.
- **Pantalla grande:** en PC o tablet se ve a dos columnas, y hay un botón de pantalla completa en el menú (☰).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Página principal |
| `styles.css` | Diseño (colores y fuentes de las cartas) |
| `app.js` | Toda la lógica de la app |
| `cards.js` | Las 227 cartas: número, categoría, nivel y texto. Si cambias una carta impresa, cámbiala aquí también. |
| `sw.js` | Service worker (funcionamiento sin internet) |
| `manifest.webmanifest`, `icons/` | Datos para instalarla como app |
| `img/`, `fonts/` | Gatos de nivel y tipografías |

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `uush`). Puede ser público o privado; en privado, GitHub Pages necesita un plan de pago.
2. Sube **el contenido** de esta carpeta a la raíz del repositorio (no la carpeta en sí):
   ```bash
   cd uush-app
   git init
   git add .
   git commit -m "App de seguimiento ¡Uush!"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/uush.git
   git push -u origin main
   ```
3. En GitHub, entra a **Settings → Pages**. En «Build and deployment», elige **Source: Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
4. Espera uno o dos minutos. La app queda en `https://TU_USUARIO.github.io/uush/`.

## Instalarla como app

- **Android (Chrome):** abre el link → menú ⋮ → **Agregar a pantalla principal** / **Instalar app**.
- **iPhone (Safari):** abre el link → botón Compartir → **Agregar a inicio**.
- **PC (Chrome o Edge):** ícono de instalar en la barra de direcciones.

Ábrela una vez con internet. Después funciona sin conexión.

## Actualizaciones

Si cambias algún archivo, sube también un cambio en `sw.js`: aumenta el número en `const CACHE = 'uush-v1'` (por ejemplo `'uush-v2'`). Así los celulares que ya la tienen instalada descargan la versión nueva.

## Probarla en tu PC antes de subirla

```bash
cd uush-app
python -m http.server 8000
```
Abre `http://localhost:8000`. Tiene que ser con un servidor: si abres `index.html` con doble clic, el modo sin internet no funciona.
