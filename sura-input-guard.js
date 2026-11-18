/**
 * SURA input guard — descarta eventos de input sintéticos.
 *
 * Un evento creado por script (`new KeyboardEvent(...)` + `dispatchEvent`,
 * que es como se arma un bot de consola o un script inyectado) llega con
 * `isTrusted === false`. Solo el navegador puede producir `true`, y **no hay
 * forma de falsificar la bandera desde la página**: es de solo lectura en el
 * prototipo de Event y el getter vive en el lado nativo.
 *
 * POR QUÉ UN SOLO ARCHIVO PARA LOS CINCO JUEGOS, en vez de tocar el input de
 * cada motor. El listener va en **fase de captura sobre `window`** y se
 * registra antes que el juego, así que corre antes que cualquier handler —
 * esté en `window`, en `document` o en el canvas, lo use Phaser, Three o DOM
 * pelado. `stopImmediatePropagation()` corta ahí mismo. Verificado contra un
 * DOM real: ningún handler del juego llega a ver el evento.
 *
 * Eso tiene una consecuencia que vale oro: **funciona en Cosmo Rush**, cuyo
 * TypeScript se perdió y solo queda el bundle compilado. Es un `<script>` en
 * el index, no una modificación del juego.
 *
 * TIENE QUE CARGAR PRIMERO. Si el juego registra sus listeners antes, los
 * suyos corren en burbujeo y esta guarda igual los corta (la captura precede
 * al burbujeo), pero un handler que el juego haya puesto *en captura sobre
 * window* antes que éste sí vería el evento. Ponerlo como primer script del
 * `<head>` lo garantiza.
 *
 * LO QUE FRENA Y LO QUE NO. Mata de una toda la clase de bots que manejan el
 * juego desde la consola o desde un script inyectado. NO frena a un bot que
 * maneja un navegador de verdad por CDP/Playwright: ahí los eventos los genera
 * el navegador y son legítimamente `trusted`. A esos los agarra el análisis de
 * la cinta de inputs del lado del servidor (tiempos de reacción, entropía entre
 * inputs), no esta bandera.
 *
 * DOS EXCLUSIONES DELIBERADAS:
 *
 *   'message'  El host nativo entrega el INIT_GAME con
 *              `window.dispatchEvent(new MessageEvent('message', ...))`, que es
 *              untrusted por construcción. Guardarlo rompe el handshake entero
 *              y el juego se queda sin sesión, sin ranking y sin recompensas.
 *
 *   'click'    Librerías de UI y tecnología asistiva disparan clicks
 *              sintéticos de forma legítima (`el.click()`). Los eventos de
 *              abajo son los que mueven el gameplay; el click no.
 *
 * La tecnología asistiva de plataforma (VoiceOver, TalkBack, switch access)
 * genera eventos **trusted** a través del sistema operativo, así que la guarda
 * no excluye a esos usuarios. Extensiones del navegador y remapeadores de
 * teclas pueden no serlo, y por eso el contador se mide antes de darle peso a
 * la señal: un valor distinto de cero se reporta y se revisa, nunca rechaza
 * una corrida por sí solo.
 *
 * REPORTA AL HOST, y esto no estaba antes. La guarda bloqueaba en silencio, y
 * el silencio tenía un costo que no se ve hasta que se intenta usar: desde el
 * servidor, una partida con diez mil eventos sintéticos descartados y una
 * partida normal se veían **idénticas**. Y desde el lado del que lo intenta,
 * un bot bloqueado no parece un anticheat funcionando: parece un juego roto.
 * Sin reporte no hay nada que mirar, ni para operar ni para probar que esto
 * sirve.
 *
 * Lo manda la GUARDA, no el juego, y es a propósito: así reporta en los cinco
 * juegos —Cosmo Rush incluido, cuyo fuente se perdió— sin tocar una línea de
 * gameplay. Misma propiedad que la hizo instalable en todos.
 *
 * El reporte es informativo y nada más. No bloquea, no demora y no decide:
 * el host lo adjunta a la completion y el servidor resuelve qué hacer con él.
 * Que el host no lo escuche tampoco es un error — un tipo de mensaje que no
 * conoce, lo ignora.
 *
 * TAMBIÉN MIRA SI ALGUIEN TOCÓ EL RUNTIME, y eso sale de una prueba real.
 *
 * Un bot que maneja el navegador por CDP genera eventos `trusted`, así que la
 * bandera de arriba no lo ve. Pero para jugar necesita LEER el mundo, y en la
 * prueba que nos pasaron lo hacía así:
 *
 *   - interceptando `Array.prototype.push`, para ver cada obstáculo que el
 *     juego spawnea;
 *   - poniendo un setter de `slideBlend` en `Object.prototype`, para capturar
 *     la instancia de física del jugador.
 *
 * Las dos cosas dejan huella desde adentro: `push` deja de ser nativo, y
 * `Object.prototype` gana una propiedad propia que no debería tener. Eso se
 * mide en microsegundos y no se puede ocultar sin romper algo más.
 *
 * ES UNA CARRERA, Y SE PIERDE A LA LARGA. Quien lea esto puede instalar sus
 * ganchos de otra forma, o mentirle a `Function.prototype.toString`. Lo que
 * esto compra es caro HOY y barato de construir: el bot que ya existe queda
 * marcado, y el que venga después tiene que trabajar más. Lo que de verdad
 * cierra el tema es que el servidor reproduzca la partida, y eso es otro
 * trabajo.
 *
 * NO BLOQUEA NADA ACÁ. Reporta, igual que el contador de inputs. Un navegador
 * con extensiones raras puede ensuciar los prototipos sin ninguna mala
 * intención, así que quién decide qué hacer con la señal es el servidor, con
 * el contexto que la página no tiene.
 */
(function () {
  "use strict";

  if (window.__suraInputGuard) {
    return;
  }

  var GUARDED = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mousemove",
    "mouseup",
    "touchstart",
    "touchmove",
    "touchend",
    "keydown",
    "keyup",
  ];

  var untrusted = 0;
  var byType = Object.create(null);

  /**
   * Lo que `Object.prototype` tiene en un runtime limpio.
   *
   * Cualquier cosa fuera de esta lista es contaminación de prototipo: nadie
   * legítimo agrega propiedades acá. Es la huella que deja el setter que el
   * bot usa para capturar la instancia de física.
   */
  var OBJECT_PROTO_LIMPIO = [
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__proto__",
  ];

  /**
   * Nativas que un bot necesita interceptar para ver el mundo sin tocar los
   * archivos del juego. `push` es la del reporte; las otras son los ganchos
   * equivalentes mas obvios si alguien mueve el suyo.
   */
  var NATIVAS_VIGILADAS = [
    ["Array.prototype.push", Array.prototype.push],
    ["Array.prototype.splice", Array.prototype.splice],
    ["Object.defineProperty", Object.defineProperty],
    ["Map.prototype.set", typeof Map === "function" ? Map.prototype.set : null],
  ];

  function esNativa(fn) {
    try {
      return Function.prototype.toString.call(fn).indexOf("[native code]") !== -1;
    } catch (err) {
      // Si ni se puede inspeccionar, no se acusa.
      return true;
    }
  }

  /**
   * Una sola pasada, al cargar.
   *
   * La guarda es el primer script del `<head>`, y los scripts que inyecta una
   * herramienta de automatizacion corren ANTES que cualquier script de la
   * pagina — asi que para cuando esto corre, los ganchos ya estan puestos y
   * se ven.
   */
  function detectarManipulacion() {
    var nativasParcheadas = [];
    var contaminacion = [];

    try {
      for (var i = 0; i < NATIVAS_VIGILADAS.length; i += 1) {
        var nombre = NATIVAS_VIGILADAS[i][0];
        var fn = NATIVAS_VIGILADAS[i][1];
        if (fn && !esNativa(fn)) {
          nativasParcheadas.push(nombre);
        }
      }
    } catch (err) {}

    try {
      var props = Object.getOwnPropertyNames(Object.prototype);
      for (var j = 0; j < props.length; j += 1) {
        if (OBJECT_PROTO_LIMPIO.indexOf(props[j]) === -1) {
          contaminacion.push(props[j]);
        }
      }
    } catch (err) {}

    return {
      nativesPatched: nativasParcheadas,
      prototypePollution: contaminacion,
    };
  }

  var tamper = detectarManipulacion();

  // Tipo propio: no colisiona con el protocolo del handshake
  // (MINIGAME_READY / INIT_GAME / SESSION_ACCEPTED / MINIGAME_STARTED /
  // GAME_COMPLETE), así que un host viejo simplemente no lo reconoce.
  var REPORT_TYPE = "SURA_INPUT_GUARD";
  var REPORT_DEBOUNCE_MS = 2000;
  var reportTimer = null;
  var reportedCount = -1;

  function isEmbedded() {
    return Boolean(window.ReactNativeWebView) || window.parent !== window;
  }

  function sendReport() {
    reportTimer = null;

    if (untrusted === reportedCount || !isEmbedded()) {
      return;
    }

    reportedCount = untrusted;

    var message = {
      type: REPORT_TYPE,
      count: untrusted,
      byType: Object.assign({}, byType),
      tamper: tamper,
    };

    try {
      // En la app nativa el canal NO es window.parent (ahí parent === window),
      // es el puente de React Native, y sólo mueve strings. Mismo criterio que
      // el `post` de sura.js.
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        return;
      }

      // '*' y no el origen del host: la guarda corre ANTES que el juego y no
      // participa del handshake, así que no conoce `providerOrigin`. Lo que
      // viaja es un contador, no un secreto, y el host valida el origen al
      // recibirlo.
      window.parent.postMessage(message, "*");
    } catch (err) {
      // Un host que no escucha no justifica romper el juego.
    }
  }

  function scheduleReport() {
    // El primero sale en el acto: una partida donde el bot actuó una sola vez
    // tiene que ser visible igual, y la completion puede llegar enseguida.
    if (reportedCount < 0) {
      sendReport();
      return;
    }

    // Los siguientes se agrupan. Un bot puede disparar miles de eventos por
    // segundo y no tiene sentido un postMessage por cada uno.
    if (reportTimer === null) {
      reportTimer = setTimeout(sendReport, REPORT_DEBOUNCE_MS);
    }
  }

  function reject(event) {
    if (event.isTrusted) {
      return;
    }

    untrusted += 1;
    byType[event.type] = (byType[event.type] || 0) + 1;
    scheduleReport();

    event.stopImmediatePropagation();
    // `preventDefault` sobre un evento no cancelable no hace nada y ensucia la
    // consola con un warning en cada uno.
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  for (var i = 0; i < GUARDED.length; i += 1) {
    window.addEventListener(GUARDED[i], reject, { capture: true });
  }

  // La manipulación se reporta sola, sin esperar a que haya un input
  // sintético: un bot por CDP no produce ninguno. Si no hay nada que contar,
  // esto es lo único que viaja.
  if (tamper.nativesPatched.length > 0 || tamper.prototypePollution.length > 0) {
    // Al final de la cola de tareas: el host todavía no instaló su listener
    // cuando el primer script del `<head>` corre.
    setTimeout(function () {
      reportedCount = -1;
      sendReport();
    }, 0);
  }

  window.__suraInputGuard = {
    /** Cuántos eventos sintéticos se descartaron desde que cargó la página. */
    get count() {
      return untrusted;
    },
    /** Desglose por tipo, para distinguir un bot de una extensión rara. */
    get byType() {
      return Object.assign({}, byType);
    },
    /** Lo que se encontró tocado al cargar. Para mirar desde la consola. */
    get tamper() {
      return {
        nativesPatched: tamper.nativesPatched.slice(),
        prototypePollution: tamper.prototypePollution.slice(),
      };
    },
    /**
     * Fuerza el envío sin esperar el agrupado. Para el host de pruebas y para
     * un juego que quiera asegurarse de que el último tramo viajó antes de
     * mandar su GAME_COMPLETE.
     */
    report: sendReport,
  };
})();
