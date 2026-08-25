# Coin Kingdom — contexto de proyecto para Claude

Suika-clone (fusionar monedas hasta llegar a la "GG") hecho con **Phaser 3.60 + TypeScript + Matter.js**, empaquetado con webpack. Está migrando de `Scale.FIT` a `Scale.RESIZE` desde hace varias sesiones; ese trabajo y todo lo que vino después (HiDPI, bugs de física, bugs de UI) está resumido acá para que cualquier sesión nueva pueda seguir sin releer todo el historial de chat.

## Cómo correrlo

- `npm run dev` levanta un dev server (webpack-dev-server) en `http://localhost:8080/`.
- `npx tsc --noEmit --skipLibCheck` para chequear tipos sin compilar — correlo después de cualquier cambio.
- Es un repo git normal (rama `main`), con historial de commits real — mirar `git log` para el detalle línea por línea de cada fix.
- **Verificación en vivo**: en casi todas las sesiones anteriores, en vez de confiar en "se ve bien", se verificó todo con Chrome headless real vía CDP (Chrome DevTools Protocol) — spawnear `chrome.exe --headless=new --remote-debugging-port=PORT`, conectar por WebSocket, usar `Runtime.evaluate` para leer estado interno del juego (`game.scale`, `camera.zoom`, posiciones de fruits, etc.), `Input.dispatchMouseEvent` para clicks reales, `Page.captureScreenshot` para capturas. Esto es el patrón a seguir para cualquier verificación nueva — no asumir, medir.

## Arquitectura clave

### El sistema de "board fijo + cámara que hace zoom" (post-migración a RESIZE)

- El mundo físico de Matter (paredes del frasco, posiciones de las monedas) vive en un espacio lógico **fijo**: `PLAY_AREA_WIDTH=580`, `PLAY_AREA_HEIGHT=800`, `PLAY_AREA_TOP_OFFSET=322` (ver `src/config/boardLayout.ts`). Esto nunca cambia con el tamaño de pantalla.
- El canvas real (`game.scale.width/height`) sí trackea el tamaño real del contenedor `#content` vía `Scale.RESIZE`.
- `MainScene.updateCameraFit()` es la función que reconcilia ambos mundos: calcula `zoom = (scale.height / CANVAS_HEIGHT) * 0.94 * dpr` y usa `camera.centerOn()` para encuadrar el frasco fijo dentro de la pantalla real, cualquiera sea su tamaño/aspect ratio. Se llama en `create()` y en cada evento `resize`.
- Los clicks/taps (`pointer.x/y`) están en espacio de pantalla, no en espacio del mundo — por eso `MainScene`'s handler de `dropFruit` usa `this.cameras.main.getWorldPoint(pointer.x, pointer.y)` para convertir, y clampea el resultado con `Phaser.Math.Clamp(worldX, DROP_X_MARGIN, PLAY_AREA_WIDTH - DROP_X_MARGIN)` (`DROP_X_MARGIN=50`) para que ninguna moneda se pueda soltar ya solapando una pared.

### El plan de nitidez HiDPI (4 etapas) — `src/util/HiDPI.ts`

**El problema original**: las monedas se veían borrosas. Diagnóstico: el canvas de Phaser en modo RESIZE nunca tuvo en cuenta `devicePixelRatio` — el backing store del canvas siempre fue del mismo tamaño que su caja CSS, así que en cualquier pantalla "retina" (dpr>1) todo se renderiza a la mitad (o menos) de la densidad real de píxeles.

**La solución** (después de que un intento anterior, más ingenuo, rompiera todo — quedó documentado como referencia de qué NO hacer): romper a propósito la igualdad que Phaser mantiene entre `ScaleManager.gameSize` (lo que lee `game.scale.width/height`, y todo el layout/física existente) y `ScaleManager.baseSize` (lo que controla `canvas.width/height` real y la transformación de `pointer.x/y`). `gameSize` se deja intacto (nada del layout existente se entera del cambio); `baseSize` se fuerza a `dpr` veces más grande. Como el propio Phaser deriva `pointer.x/y` de `baseSize`, todas las cámaras y el hit-testing de botones se "cascada" automáticamente a la resolución más densa sin tocar cada call site a mano.

Todo esto vive en `src/util/HiDPI.ts`, con 4 funciones (Etapas 1-3 + follow-up):

1. **`getEffectiveDevicePixelRatio()` / `cacheDevicePixelRatio()`** — lee `window.devicePixelRatio`, lo **capea en 2** (más allá de eso el costo de memoria/fill-rate crece con el cuadrado del factor, para una ganancia visual marginal), lo cachea en `game.registry` bajo la key `devicePixelRatio` para que todas las escenas lean el mismo valor.
2. **`applyHiDPIBackingStore(game)`** — el corazón del fix: sobreescribe `baseSize`, `canvas.width/height`, re-fija `canvas.style.width/height` al tamaño lógico, llama `renderer.resize()`, y recalcula `displayScale` a mano (Phaser lo calcula *antes* de que nuestro override corra, así que si no lo recalculamos queda con el ratio viejo por todo un ciclo). Se llama desde `game.ts` en cada evento `resize`, registrado **inmediatamente después de crear el juego** (antes de que arranque cualquier escena) para ganarle en orden de ejecución al `CameraManager` interno de Phaser.
3. **`MainScene.updateCameraFit()`** (no vive en HiDPI.ts, vive en `MainScene.ts`) — multiplica su fórmula de zoom existente por `dpr`, y **fija el tamaño de la cámara explícitamente** (`camera.setSize(...)`) en vez de confiar en el auto-track de `CameraManager` (ese auto-track solo dispara si el ancho actual de la cámara coincide exactamente con el ancho lógico *anterior* del juego — no es confiable entre reinicios de escena, y romperlo causó un bug real de mapeo de clicks que quedó documentado en el propio comentario del código).
4. **`applyUniformDPRCameraFit(scene)`** — lo mismo que el punto 3 pero para `HUDScene`/`MenuScene`/`DebugScene`, que no tienen zoom "cover" propio (zoom=1, cámara de UI en espacio de pantalla).
5. **`applyDPRToAllText(scene)`** — hallazgo importante: `Phaser.GameObjects.Text` tiene su **propia** resolución de renderizado (`style.resolution`), totalmente independiente del zoom de cámara — así que el zoom de cámara por sí solo mejora sprites/gráficos pero **no** el texto (de hecho lo empeora un poco, por magnificación). La documentación de Phaser dice que un `resolution` sin setear usa el "Game Config", pero es falso — el código fuente de `Text.js` lo hardcodea a `1` sin nunca leer `game.config.resolution`. La única solución real es `text.setResolution(dpr)` por instancia; se barre cada `Text` de la escena (`scene.children.list`) en vez de tocar cada `this.add.text(...)` uno por uno (hay más de una docena repartidos entre `create()` y varios ciclos de destroy+rebuild — un edit manual por-sitio corre el riesgo real de olvidarse alguno).

**Guarda de "resize a 0×0" — importante, y NO trivial**: el panel de Ajustes (`.game { display:none }` al abrirlo, ver `game.ts`'s `toggleSettings()`) hace que `#content` colapse a `0×0` momentáneamente (confirmado en vivo). Esto dispara un ciclo de resize con `gameSize.width/height = 0`, que si no se filtra, colapsa `canvas.width`, hace que el zoom de `MainScene` caiga al piso interno de Phaser (`0.001`, no `0`), y varias funciones de reposicionamiento de `HUDScene` (`repositionHeader()`, `rescaleFreeFloatingTextFontSizes()`, etc.) mandan el ícono de pausa y el texto de Puntaje/Récord a posiciones basura (`x=0`, tamaño de fuente al mínimo). Fix: cada función que lee `scale.width/height` para reposicionar algo necesita chequear `if (width === 0 || height === 0) return` **al principio**, antes de hacer nada. Ya está aplicado en:
   - `applyHiDPIBackingStore()` (con una lógica más elaborada: como Phaser ya puso `canvas.width=0` ANTES de que esta función corra, no alcanza con un simple `return` — hay que **reaplicar activamente** el último tamaño bueno conocido, cacheado en variables de módulo `lastGoodBackingWidth/Height/LogicalWidth/Height`).
   - `applyUniformDPRCameraFit()` — acá sí alcanza con un `return` simple.
   - `MainScene.updateCameraFit()` — mismo `return` simple.
   - `HUDScene.onResize()` — guarda al principio, ANTES de las 6 llamadas que hace (incluida `applyUniformDPRCameraFit`).
   - `MenuScene.onResize()` — misma guarda, agregada preventivamente aunque nunca mostró síntoma visible.

**Si tocás cualquiera de estas funciones de nuevo**: repetí el patrón de medir `camera.zoom`, `camera.width/height`, `canvas.width` y las posiciones/tamaños de texto de HUD, abriendo y cerrando Ajustes tanto desde el menú como durante el juego real, en más de un viewport (esto encontró bugs reales cada vez que se hizo).

## Bugs de gameplay resueltos (y sus causas raíz)

### 1. Monedas escapándose del frasco
`MainScene`'s handler de `pointerup` no clampeaba `worldX` antes de crear la fruta. Fix: `Phaser.Math.Clamp(worldX, DROP_X_MARGIN, PLAY_AREA_WIDTH - DROP_X_MARGIN)` con `DROP_X_MARGIN=50`.

### 2. Reinicio automático sin aviso al perder
No había popup de Game Over — `MainScene` emitía `'gameOver'` y llamaba `resetBoard()` directo. Se agregó un overlay completo en `HUDScene` (`buildGameOverOverlay()`/`showGameOverOverlay()`, reusa el patrón visual de `buildPauseOverlay()` y el mismo patrón de destroy+rebuild en cada resize) con "Jugar de nuevo" (emite `'restartAfterGameOver'`, que `MainScene` escucha y llama `resetBoard()`) y "Volver al menú" (reusa `returnToMenu()`, el mismo método que ya usa el botón de pausa — importante para no reintroducir la fuga de listeners que ese método ya había resuelto antes). `MAIN_SCENE_CUSTOM_EVENT_NAMES` (el array que `MainScene` usa para limpiar sus propios listeners en `shutdown`) tiene `'restartAfterGameOver'` agregado.

**Nota sobre cómo se verificó esto**: provocar una derrota *genuina* (no simulada) vía drops automatizados reales resultó sorprendentemente difícil — el propio juego tiene mecánicas anti-acumulación (fusiones + la explosión de supernova al juntar 3 GG) que compiten contra cualquier intento de llenar el frasco al azar. La receta que finalmente funcionó: alternar tiers bien distintos (para evitar fusiones accidentales) en un clúster de posiciones X muy angosto (para apilar en vez de esparcir), y — el paso clave — **congelar los drops en cuanto `inDanger` se pone `true`** en vez de seguir tirando monedas (seguir tirando arriesgaba que una fusión consumiera justo la moneda que estaba en la zona de peligro antes de que se cumplieran los 2.5s del timer).

### 3. Monedas de fusión solapándose / sobresaliendo del frasco
Causa raíz: cuando dos monedas del mismo tier se fusionan, `MainScene` crea la moneda nueva (más grande) en `new Fruit(this.matter.world, fruit1.x, fruit1.y - 50, fruit1.fruitType + 1, ...)` — **sin ningún clamp horizontal**, a diferencia del drop por tap que sí clampea. Si `fruit1` estaba cerca de una pared o de otra moneda, la moneda resultante (con radio bastante mayor) nacía ya solapando. Afectaba sobre todo a los tiers de radio más grande (Esmeralda, Reina, Zafiro, OrbeSolar/diamante, Supernova/GG — exactamente las tiers que solo pueden aparecer como *producto* de una fusión, nunca como drop directo).

Fix, en el mismo handler de `collisionstart`:
```ts
const newRadius = (fruit.displayWidth / 2) * ORB_TIER_HITBOX_FRACTIONS[fruit.fruitType];
const clampedX = Phaser.Math.Clamp(fruit1.x, newRadius, PLAY_AREA_WIDTH - newRadius);
if (clampedX !== fruit1.x) fruit.setPosition(clampedX, fruit.y);
```
Confirmado en vivo: el peor caso (spawnear una fusión pegada a la pared) pasó de un hitbox ~10px afuera de la pared a solo ~1px (ruido normal de asentamiento físico, no del spawn).

**Importante — lo que este fix NO resuelve**: solapamiento *transitorio* durante juego activo (varias monedas grandes cayendo rápido). Se investigó a fondo y es comportamiento normal del solver de Matter.js con cuerpos grandes/pesados (no hay `positionIterations`/`velocityIterations` custom, son los defaults) — el solapamiento se resuelve solo en cuanto para de haber drops nuevos (confirmado: 0 solapamientos a los 500ms/1s/2s/3s de que paran los drops), pero durante juego activo puede verse feo en una captura tomada en el momento exacto. Si se quiere atacar esto, la vía sería subir `positionIterations`/`velocityIterations` en la config de Matter de `game.ts` — **no se hizo todavía**, quedó como posible trabajo futuro.

### 4. Bugs puntuales del asset del diamante (`assets/coins/7_diamante.png`)
- El archivo real mide 320×320, no 340×340 como asumía un comentario viejo — eso desfasaba tanto `ORB_TIER_SCALES[OrbeSolar]` (tamaño visual) como `ORB_TIER_HITBOX_FRACTIONS[OrbeSolar]` (tamaño del colisionador). Ambos se re-midieron contra el archivo real y se corrigieron.
- El diamante se veía casi idéntico en tamaño a GG — la causa no era el tamaño nominal del sprite sino que su fracción de hitbox (contenido opaco real) es mucho más alta que la de GG, así que el disco *visible* real coincidía casi exacto aunque el sprite nominal fuera más chico. Se re-calculó `ORB_TIER_SCALES[OrbeSolar]` apuntando a un diámetro visible (`bodyRadius × 2`) específico, entre Zafiro y GG, más cerca de Zafiro.
- El archivo tenía dos "estrellitas"/destellos decorativos que sobresalían del disco circular, remanentes de un trabajo previo de "sacar los brillos". Se detectaron con un escaneo de 360 rayos (no solo los 4 cardinales — por eso habían pasado desapercibidas antes) y se corrigieron con una máscara circular + un parche de filtro de mediana para el brillo cuyo núcleo caía *dentro* del círculo (una máscara de radio sola no lo hubiera sacado, porque ese pixel específico seguía teniendo alfa=255, el problema era de color/brillo, no de transparencia).
- **Valores actuales** (por si hace falta volver a tocarlos): `ORB_TIER_SCALES[OrbeSolar] = 0.7282`, `ORB_TIER_HITBOX_FRACTIONS[OrbeSolar] = 0.9453`.

### 5. Metodología de medición de "fracción de hitbox" (reusable para cualquier moneda)
Para cualquier archivo de `assets/coins/*.png`: escanear el canal alfa a lo largo de rayos desde el centro, encontrar el último radio donde `alpha >= 250`, promediar (mínimo 4 rayos cardinales; para detectar protuberancias puntuales como las estrellitas del diamante, usar 180-360 rayos). `fracción = radio_promedio / (ancho_nativo / 2)`. Esto es lo que alimenta `ORB_TIER_HITBOX_FRACTIONS`, que a su vez determina el radio del círculo de colisión de Matter (`Fruit.ts`: `this.setCircle((this.displayWidth / 2) * ORB_TIER_HITBOX_FRACTIONS[type])`).

## Archivos clave

| Archivo | Qué maneja |
|---|---|
| `src/game.ts` | Config de Phaser, hooks de resize/HiDPI a nivel juego, toggle de Ajustes (DOM puro) |
| `src/config/boardLayout.ts` | Constantes del tablero fijo (`PLAY_AREA_*`, `CANVAS_*`, `HEADER_HEIGHT`) |
| `src/util/HiDPI.ts` | Todo el plan de nitidez (ver arriba) |
| `src/scenes/MainScene.ts` | Física del juego, `updateCameraFit()`, merge/supernova, drop de monedas |
| `src/scenes/HUDScene.ts` | Puntaje/Récord, panel "Siguiente", overlays de Pausa y Game Over |
| `src/scenes/MenuScene.ts` | Menú principal, "Cómo jugar" |
| `src/gameobjects/Fruit.ts` | `OrbTier` enum, `ORB_TIER_SCALES`, `ORB_TIER_HITBOX_FRACTIONS`, `ORB_TIER_COLORS`, etc. |
| `index.html` / `index.css` | Panel de Ajustes (DOM, fuera de Phaser), estructura `.game-wrapper > .game.pane > #content` que Phaser usa como parent en modo RESIZE |
| `assets/coins/*.png` | Arte de cada moneda — cualquier reemplazo de archivo requiere re-medir `ORB_TIER_SCALES`/`ORB_TIER_HITBOX_FRACTIONS` contra el archivo real, no confiar en comentarios viejos |

## Lecciones / cosas a no repetir

- **No asumir que un comentario en el código sigue siendo cierto** — el bug del diamante (340 vs 320px) existía precisamente porque un comentario decía un tamaño de archivo que ya no era el real.
- **Medir en vivo, siempre, antes y después de cualquier fix de cámara/resize** — casi todos los bugs reales de esta sesión (el mismatch de ancho de cámara entre carga fresca y reinicio de escena, el `displayScale` desactualizado, el colapso a 0×0 de Ajustes) se encontraron midiendo en el navegador real, no razonando en abstracto.
- **Cualquier función que reposicione algo usando `scale.width/height` necesita la guarda de 0×0** — es fácil agregar una función nueva a `onResize()` y olvidarse.
- **`CameraManager.onResize` de Phaser (auto-track) es frágil** — solo re-sincroniza el tamaño de una cámara si coincide exactamente con el ancho lógico *anterior* del juego. No confiar en él; fijar tamaño de cámara explícitamente.
- **Texto de Phaser (`GameObjects.Text`) no hereda nitidez del zoom de cámara** — necesita `setResolution()` aparte.
