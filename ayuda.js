/* Contenido de la ayuda de Finanzas CYAROMA. Se descarga SOLO cuando alguien abre el botón «Ayuda» (no pesa en el arranque).
   Para agregar o corregir una pregunta se edita este archivo; no se toca la lógica de la app.
   Formato del texto: **negritas**. Cada pantalla se identifica por su clave de menú (la de SECTION_META). */
window.AYUDA = {
  version: 1,
  primerosPasos: [
    'Elige el **negocio** arriba a la izquierda.',
    'Elige el **mes** arriba a la derecha (en las pantallas que lo usan).',
    'Entra a una pantalla desde el **menú** de la izquierda.',
    'Si tienes una duda, abre **Ayuda**: te explica la pantalla donde estás.',
    'Todo lo que hagas queda en **Auditoría** con tu usuario.'
  ],
  glosario: [
    { t: 'Cargo y abono', d: 'Los dos lados de un registro contable. En una póliza, la suma de cargos debe ser igual a la de abonos para que cuadre.' },
    { t: 'Póliza', d: 'Registro contable con fecha, concepto y líneas (cuenta, cargo, abono). Si los cargos no son iguales a los abonos, queda «descuadrada».' },
    { t: 'Traspaso', d: 'Dinero que pasa de una cuenta tuya a otra (por ejemplo, de la terminal de tarjeta al banco). Siempre son **dos movimientos**: una salida y un depósito.' },
    { t: 'Número TR', d: 'El número de operación de un traspaso (TR-000368). Los dos movimientos del traspaso lo comparten.' },
    { t: 'Conciliación', d: 'Comparar tus registros contra el estado de cuenta real del banco. Lo que no aparece en el banco todavía son partidas en tránsito.' },
    { t: 'Cierre de periodo', d: 'Cuando un mes se cierra, ya no se pueden crear ni cambiar movimientos con fechas de ese mes.' },
    { t: 'Regla de importación', d: 'Una instrucción que propone clasificar automáticamente ciertas filas al importar un Excel. Siempre pide tu confirmación antes de guardar.' },
    { t: 'Póliza programada', d: 'Una póliza modelo con un calendario: se crea sola, con la fecha que le toca, cada cierto tiempo.' },
    { t: 'Modo financiero y modo fiscal', d: 'Cada negocio trabaja en uno de los dos. El fiscal agrega las pantallas de impuestos, CFDI y papeles de trabajo.' },
    { t: 'CFDI (XML)', d: 'El comprobante fiscal digital de una factura. Su archivo XML es el que valida el SAT.' },
    { t: 'IVA acreditable', d: 'El IVA de tus compras que puede restarse del que cobras. Como orientación general se acredita cuando la factura está **pagada** y se cuenta con su CFDI; confírmalo siempre con tu contador.' },
    { t: 'Provisión', d: 'Registrar un gasto o un ingreso en el mes en que corresponde, aunque todavía no se haya pagado o cobrado.' }
  ],
  pantallas: {
    bancos: {
      resumen: 'Aquí ves el saldo y los movimientos de cada cuenta bancaria del negocio, mes por mes. Es donde se importan los estados de cuenta y se concilia contra el banco.',
      pasos: [
        'Elige la cuenta en las etiquetas de arriba. El mes se cambia arriba a la derecha.',
        'Para cargar un estado de cuenta, pulsa **Importar movimientos (Excel)**. Las filas que ya existían se omiten solas.',
        'Para un movimiento suelto, usa **+ Agregar movimiento**. Puedes adjuntar su comprobante.',
        'Para mover dinero entre dos cuentas, usa **Transferir**: se crean los dos movimientos con el mismo número TR.',
        'Al cierre, **Conciliar** compara tus registros con el estado de cuenta del banco.'
      ],
      faq: [
        { q: '¿Cómo importo un estado de cuenta?', a: 'Pulsa **Importar movimientos (Excel)** y elige el archivo. Se cargan las filas nuevas y se omiten las que ya estaban. Si alguna coincide con una regla de importación, antes de guardar verás una ventana para confirmarla.' },
        { q: '¿Qué pasa cuando una fila coincide con una regla?', a: 'Se abre **Confirmar reglas de importación** con las filas, la regla y a dónde se registrarían como traspaso. Puedes desmarcar filas, **importar sin aplicar reglas** o cancelar. No se guarda nada hasta que confirmes.' },
        { q: '¿Qué hago si un traspaso muestra «⚠ falta su salida» o «falta su depósito»?', a: 'Quedó con un solo movimiento. Ábrelo con **⋯ → Editar**, elige la otra cuenta y guarda: se crea el movimiento que falta. La pantalla Revisión de consistencia también los lista.' },
        { q: '¿Por qué una cuenta como Terminal HSBC sale en negativo?', a: 'Esa cuenta recibe las ventas con tarjeta y entrega lo que luego deposita el banco. Si el banco ya recibió el dinero y las ventas todavía no se han capturado, el saldo se ve negativo. No es un error del traspaso: **faltan ventas por registrar**.' },
        { q: '¿Cómo elimino un traspaso?', a: 'Ábrelo con **⋯ → Eliminar**. La app avisa que elimina **los dos movimientos** (la salida y el depósito) y los saldos de las dos cuentas vuelven a como estaban.' },
        { q: '¿Cómo concilio una cuenta?', a: 'Pulsa **Conciliar**. Escribe la fecha de corte y el saldo que dice tu estado de cuenta, y marca los movimientos que ya aparecen en el banco. Lo que quede sin marcar son cheques o depósitos en tránsito. Si hay diferencia, la ventana te la muestra antes de cerrar. Al cerrar, los marcados quedan conciliados y se registra en Auditoría.' },
        { q: '¿Por qué mi movimiento nuevo salió con la fecha de mañana?', a: 'Pasadas las **7:00 p.m.** (hora de Cancún) la fecha que la app sugiere puede salir un día adelante. Revisa la fecha antes de guardar y corrígela si hace falta.' }
      ],
      cuidado: [
        'Un traspaso son **dos movimientos** con el mismo número TR. Si eliminas uno, se eliminan los dos.',
        'Si el periodo está cerrado, no se pueden importar ni cambiar movimientos de esas fechas.',
        'Un saldo negativo en una cuenta puente suele significar ventas por capturar, no un error.'
      ],
      auditoria: 'Cada alta, edición o eliminación de un movimiento, cada importación que aplicó reglas y cada conciliación quedan con tu usuario y el «antes → después».',
      relacionadas: ['recurrentes', 'polizas', 'auditoria']
    },
    polizas: {
      resumen: 'Registro de las pólizas del negocio. Cada póliza tiene cargos y abonos que deben cuadrar. Aquí se crean, buscan, duplican y se programan para que se repitan solas.',
      pasos: [
        'Para registrar una póliza, pulsa **+ Nueva póliza**: captura la fecha, el concepto y las líneas (cuenta, cargo, abono). Debe cuadrar: cargos = abonos.',
        'Para buscar, usa el campo de búsqueda (concepto, número o importe) y los filtros Desde y Hasta. **✕ Limpiar filtros** los quita.',
        '**Duplicar** crea una copia de una póliza para editarla.',
        '**Repetir…** programa una póliza para que se cree sola cada cierto tiempo (por ejemplo, la renta).',
        '**Importar pólizas (Excel)** carga varias a la vez. **Catálogo de cuentas** muestra las cuentas que puedes usar.'
      ],
      faq: [
        { q: '¿Qué significa Cuadrada y Descuadrada?', a: '**Cuadrada**: la suma de cargos es igual a la de abonos. **Descuadrada**: no coinciden, y hay que corregir las líneas antes de que la póliza sirva.' },
        { q: '¿Qué es la marca «Programada»?', a: 'Esa póliza la creó sola una póliza programada. Se puede ver, editar o borrar como cualquier otra. Si la borras, no se vuelve a crear.' },
        { q: '¿Cómo programo una póliza que se repite?', a: 'Pulsa **Repetir…** en la póliza modelo. Elige cada cuántos meses, el día del mes, la fecha de inicio y, si quieres, la de término. Si la fecha de inicio ya pasó, se crean de inmediato las que ya tocaron, cada una con su fecha.' },
        { q: '¿Por qué no puedo programar una póliza?', a: 'Solo se pueden programar pólizas que **cuadren** y usen cuentas del catálogo, bancos o efectivo. Las ligadas a facturas de proveedor o de cliente todavía no se pueden.' },
        { q: '¿Qué queda en Auditoría cuando edito una póliza?', a: 'Los cambios de fecha, concepto, cuentas y montos, como «antes → después», con tu usuario.' },
        { q: '¿Por qué no me deja guardar una póliza?', a: 'Normalmente es porque **no cuadra** (cargos distintos de abonos), falta la fecha o el periodo está cerrado.' }
      ],
      cuidado: [
        'Revisa la fecha antes de guardar: pasadas las 7:00 p.m. (hora de Cancún) la app puede sugerir la fecha de mañana.',
        'Si cambias una póliza creada por una programada, el cambio no afecta a las que se creen después.'
      ],
      auditoria: 'Crear, editar y eliminar pólizas, con los cambios de fecha, concepto, cuentas y montos como «antes → después».',
      relacionadas: ['recurrentes', 'bancos', 'auditoria']
    },
    recurrentes: {
      resumen: 'Dos herramientas para no repetir captura: **reglas de importación** que proponen clasificar filas al importar, y **pólizas programadas** que se crean solas con su fecha.',
      pasos: [
        '**Reglas de importación → + Nueva regla.** Define en qué cuenta aplica, si es depósito o cargo, el texto que debe contener la descripción, el monto (opcional) y la otra cuenta del traspaso.',
        '**Probar** muestra cuántos movimientos ya importados habrían coincidido. Solo consulta: no cambia nada.',
        '**Programadas:** crea una desde **Repetir…** en Pólizas de Diario, o con **+ Nueva programada**.',
        'Cada programada se puede pausar, reanudar, editar o eliminar. El **Historial** dice qué se creó y cuándo.'
      ],
      faq: [
        { q: '¿Una regla guarda algo sola?', a: 'No. Al importar, las filas que coinciden se muestran para que las confirmes. **Nada se guarda hasta que confirmes.**' },
        { q: '¿Por qué mi regla no coincide con ninguna fila?', a: 'Revisa que el texto esté en la descripción tal como viene del banco (no distingue mayúsculas ni acentos), que el tipo (depósito o cargo) sea el correcto y que la cuenta sea la misma. Usa **Probar** para comprobarlo.' },
        { q: '¿Puedo poner varios textos en una regla?', a: 'Una regla busca **un** texto. Si necesitas dos alternativas, crea dos reglas con la misma acción: si una fila coincide con las dos, se usa una sola vez.' },
        { q: '¿Cuándo se crean las pólizas programadas?', a: 'Al iniciar sesión, o con **Crear las pendientes ahora**. Cada una se crea con la fecha que le tocaba, aunque ya haya pasado. No hay un proceso de madrugada: si nadie entra, se crean en cuanto alguien entre.' },
        { q: '¿Qué significan Activa, Aún no inicia y Pausada?', a: '**Activa**: se crea según su calendario. **Aún no inicia**: todavía no llega su fecha de inicio. **Pausada**: no crea nada; debajo verás el motivo (la pausaste tú, o llegó su fecha de término).' },
        { q: '¿Qué pasa si el periodo está cerrado?', a: 'Esa póliza no se crea hacia atrás. Queda como «no creada: periodo cerrado» en el Historial y se crea sola, con su fecha original, cuando el periodo se reabra.' },
        { q: '¿Qué pasa con lo ya creado si cambio el monto de una programada?', a: 'No cambia. El cambio solo aplica a lo que se cree **después**, y queda en Auditoría.' }
      ],
      cuidado: [
        'Una regla con un texto muy general puede proponer filas que no corresponden. **Revisa siempre la ventana de confirmación.**',
        'Si dos reglas coinciden con la misma fila, se usa la más antigua y se registra una sola vez.',
        'Si el día es 29, 30 o 31, en los meses más cortos se usa el último día del mes.'
      ],
      auditoria: 'Crear, editar (con «antes → después»), activar o desactivar, pausar, reanudar y eliminar reglas y programadas, y cada póliza o traspaso que se crea por ellas.',
      relacionadas: ['bancos', 'polizas', 'auditoria']
    },
    proveedores: {
      resumen: 'Facturas por pagar a proveedores: cuánto se debe, a quién y desde cuándo, y los pagos que ya se aplicaron.',
      pasos: [
        'El **Directorio** muestra por proveedor sus facturas pendientes y el total adeudado. **Facturas** las muestra una por una.',
        '**+ Agregar factura** registra una factura. **Importar facturas (Excel)** carga varias a la vez.',
        '**+ Nota de crédito** registra una devolución, descuento o corrección del proveedor.',
        'Los pagos se aplican a las facturas desde el movimiento de Bancos o Efectivo, al clasificar la salida como pago a proveedor.',
        '**Catálogo de proveedores** y **Catálogo de cuentas** administran los datos base.'
      ],
      faq: [
        { q: '¿Qué significa cada estatus de una factura?', a: '**Pendiente**: sin pagos. **Parcial**: se ha pagado una parte. **Pagado**: el saldo está en cero. **Cancelado**: la factura se anuló.' },
        { q: '¿Qué son los «Días retraso»?', a: 'Los días que han pasado desde el vencimiento de una factura que todavía tiene saldo.' },
        { q: '¿Cómo registro una devolución del proveedor?', a: 'Con **+ Nota de crédito**, que descuenta lo devuelto o corregido.' },
        { q: '¿Se puede programar una factura de proveedor que se repite?', a: 'Todavía no. Está planeado para una próxima versión, con aviso de que esas facturas no llevan CFDI hasta que lo agregues.' }
      ],
      cuidado: [
        'Como orientación general, el IVA de una compra se acredita cuando la factura está **pagada** y, en negocios fiscales, con su CFDI (XML). Confírmalo con tu contador.'
      ],
      auditoria: 'Altas, ediciones, notas de crédito y pagos de facturas, con tu usuario y el «antes → después».',
      relacionadas: ['bancos', 'cfdi', 'auditoria']
    },
    impuestos: {
      aviso: '**Sección en construcción.** Las cifras de Impuestos y de Papeles de trabajo todavía se están terminando. Valídalas con quien administra la contabilidad antes de usarlas.',
      resumen: 'Reúne, por mes y por negocio, el IVA, el ISR, las retenciones y los pagos de impuestos. Solo aparece en negocios del modo fiscal.',
      pasos: [
        'Cambia el mes arriba a la derecha.',
        'Usa las pestañas **Resumen, IVA, ISR, Retenciones y Pagos** para ver cada tema.',
        'Cada pestaña tiene su propia dirección: puedes copiar el enlace y compartirlo.'
      ],
      noExplica: 'Cómo se determina cada cifra. Esa parte se explicará cuando la sección esté terminada; mientras tanto, consúltala con tu contador.',
      faq: [],
      cuidado: [],
      auditoria: '',
      relacionadas: ['papelestrabajo', 'cfdi', 'auditoria']
    },
    papelestrabajo: {
      aviso: '**Sección en construcción.** Los papeles de trabajo todavía se están terminando. Valida las cifras con quien administra la contabilidad antes de usarlas.',
      resumen: 'Reúne, por pestañas, los papeles que respaldan los cálculos fiscales del negocio: Resumen, ISR, IVA, Pérdidas y Retenciones.',
      pasos: [
        'Cambia el mes arriba a la derecha.',
        'Cambia de pestaña para ver cada papel de trabajo.',
        'Cada pestaña tiene su propia dirección: puedes copiar el enlace.'
      ],
      noExplica: 'Cómo se calcula cada papel de trabajo. Esa parte se explicará cuando la sección esté terminada.',
      faq: [],
      cuidado: [],
      auditoria: '',
      relacionadas: ['impuestos', 'cfdi', 'auditoria']
    }
  },
  grupos: [
    { t: 'Operación diaria', k: ['ventas', 'efectivo', 'bancos', 'proveedores', 'clientes', 'cfdi'] },
    { t: 'Contabilidad', k: ['polizas', 'pl', 'flujo', 'balance', 'librodiario', 'diariospolizas', 'auxiliares', 'balanza', 'catalogo', 'activosfijos'] },
    { t: 'Automatización', k: ['recurrentes'] },
    { t: 'Fiscal · en construcción', solo: 'fiscal', k: ['impuestos', 'papelestrabajo', 'ivafiscal', 'isrprovisional', 'pagosimpuestos', 'cedulasmaestras', 'parametrosfiscales', 'fuentesfiscales', 'recargos', 'diasinhabiles'] },
    { t: 'Control', k: ['auditoria', 'revision', 'comparativo', 'negocios', 'configuracion'] }
  ]
};
