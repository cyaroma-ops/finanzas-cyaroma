/* Contenido de la ayuda de Finanzas CYAROMA (versión 2: las 33 pantallas y 5 guías).
   Se descarga SOLO cuando alguien abre el botón «Ayuda» (no pesa en el arranque).
   Para agregar o corregir una pregunta se edita este archivo; no se toca la lógica de la app.
   Formato del texto: **negritas**. Cada pantalla se identifica por su clave de menú (la de SECTION_META); las guías por «guia_…». */
window.AYUDA = {
  version: 2,
  primerosPasos: [
    'Elige el **negocio** arriba a la izquierda.',
    'Elige el **mes** arriba a la derecha (en las pantallas que lo usan).',
    'Entra a una pantalla desde el **menú** de la izquierda.',
    'Si tienes una duda, abre **Ayuda**: te explica la pantalla donde estás. En «Todas las pantallas» también hay guías paso a paso.',
    'Todo lo que hagas queda en **Auditoría** con tu usuario.'
  ],
  glosario: [
    { t: 'Cargo y abono', d: 'Los dos lados de un registro contable. En una póliza, la suma de cargos debe ser igual a la de abonos para que cuadre.' },
    { t: 'Póliza', d: 'Registro contable con fecha, concepto y líneas (cuenta, cargo, abono). Si los cargos no son iguales a los abonos, queda «descuadrada».' },
    { t: 'Traspaso', d: 'Dinero que pasa de una cuenta tuya a otra (por ejemplo, de la terminal de tarjeta al banco). Siempre son **dos movimientos**: una salida y un depósito.' },
    { t: 'Número TR', d: 'El número de operación de un traspaso (TR-000368). Los dos movimientos del traspaso lo comparten.' },
    { t: 'Cuenta puente', d: 'Una cuenta que solo recibe dinero para pasarlo a otra, como la terminal de tarjeta. Su saldo debería quedar cerca de cero cuando todo está capturado.' },
    { t: 'Conciliación', d: 'Comparar tus registros contra el estado de cuenta real del banco. Lo que no aparece en el banco todavía son partidas en tránsito.' },
    { t: 'Cierre de periodo', d: 'Cuando un mes se cierra, ya no se pueden crear ni cambiar movimientos con fechas de ese mes.' },
    { t: 'Balanza de comprobación', d: 'La lista de todas las cuentas con sus saldos. Si el total de cargos es igual al de abonos, la contabilidad cuadra.' },
    { t: 'Libro Diario', d: 'Todos los asientos del negocio, en orden de fecha, con sus cargos y abonos.' },
    { t: 'Cuenta mayor y subcuenta', d: 'La estructura del catálogo de cuentas: una cuenta mayor agrupa subcuentas, y una subcuenta puede tener sub-subcuentas.' },
    { t: 'Sin clasificar', d: 'Un movimiento que todavía no tiene asignada su cuenta o su tipo. Hasta que se clasifica, no aparece en el lugar correcto de los reportes.' },
    { t: 'Nota de crédito', d: 'Registro que reduce lo que se debe o lo que te deben: una devolución, un descuento o una corrección.' },
    { t: 'Cuentas por cobrar (CxC)', d: 'Lo que tus clientes todavía te deben.' },
    { t: 'Regla de importación', d: 'Una instrucción que propone clasificar automáticamente ciertas filas al importar un Excel. Siempre pide tu confirmación antes de guardar.' },
    { t: 'Póliza programada', d: 'Una póliza modelo con un calendario: se crea sola, con la fecha que le toca, cada cierto tiempo.' },
    { t: 'Modo financiero y modo fiscal', d: 'Cada negocio trabaja en uno de los dos. El fiscal agrega las pantallas de impuestos, papeles de trabajo y cédulas fiscales.' },
    { t: 'CFDI (XML)', d: 'El comprobante fiscal digital de una factura. Su archivo XML es el que valida el SAT.' },
    { t: 'IVA acreditable', d: 'El IVA de tus compras que puede restarse del que cobras. Como orientación general se acredita cuando la factura está **pagada** y se cuenta con su CFDI; confírmalo siempre con tu contador.' },
    { t: 'Provisión', d: 'Registrar un gasto o un ingreso en el mes en que corresponde, aunque todavía no se haya pagado o cobrado.' },
    { t: 'Bitácora (Auditoría)', d: 'El registro de quién creó, editó o eliminó cada dato, con su fecha y hora.' }
  ],
  pantallas: {
    dashboard: {
      resumen: 'Vista consolidada de tus negocios en un vistazo: cuánto se vendió en el mes, cuánta liquidez hay y cuánto se debe a proveedores.',
      pasos: [
        'Cambia el mes arriba a la derecha.',
        '**Ventas del mes por negocio** compara cuánto vendió cada uno.',
        '**Composición de liquidez** muestra cómo se reparte lo que hay en efectivo y en bancos.',
        '**Detalle por negocio** trae una fila por negocio: ventas del mes, efectivo, bancos, proveedores pendientes y posición neta.'
      ],
      faq: [
        { q: '¿Qué negocios veo aquí?', a: 'Un administrador ve todos los negocios del grupo. Los demás ven solo los suyos.' },
        { q: '¿Por qué dice «Calculando resumen de todos los negocios…»?', a: 'Está sumando los datos de cada negocio. Con varios negocios puede tardar unos segundos.' },
        { q: '¿Qué es la posición neta?', a: 'Un resumen de la liquidez del negocio: lo que hay en efectivo y bancos frente a lo que se debe a proveedores.' }
      ],
      cuidado: ['El Dashboard solo lee: no cambia ningún dato. Para corregir una cifra, entra a la pantalla de donde viene.'],
      auditoria: '',
      relacionadas: ['ventas', 'bancos', 'comparativo']
    },
    ventas: {
      resumen: 'Aquí se captura el cierre de cada día de ventas: lo vendido por categoría y cómo se cobró (efectivo, tarjeta, bancos, cuentas por cobrar). Compara lo que reporta tu sistema contra lo capturado. En negocios fiscales la pantalla se llama «Auditoría de Ventas».',
      pasos: [
        'La primera vez, pulsa **Configurar categorías de venta** y agrega lo que vende el negocio (por ejemplo Alimentos, Bebidas, Daypass).',
        'Para capturar un día, usa **+ Agregar día**.',
        'Para cargar muchos días, pulsa **Descargar plantilla**, llénala y súbela con **Importar ventas (Excel)**.',
        'Revisa las columnas **Dif.** (efectivo, tarjeta y total): si están en cero, el día cuadra.'
      ],
      faq: [
        { q: '¿Qué columnas trae el Excel de ventas?', a: 'Usa siempre la **plantilla**. Trae la Fecha, una columna por cada categoría de venta que configuraste (y su «TC» si es en otra moneda), los gastos del día y, si los usas, las columnas de lo que reporta tu sistema (efectivo, tarjetas y CxC). Si cambias los nombres de las columnas, la importación no los reconoce.' },
        { q: '¿Qué significan las columnas «Dif.»?', a: 'Comparan lo que tu sistema dice que se vendió con lo que realmente se contó o cobró. Una diferencia hay que revisarla antes de cerrar el mes.' },
        { q: '¿Por qué aparece «Aún no configuras qué vende este negocio»?', a: 'Porque el negocio todavía no tiene categorías de venta. Pulsa **Configurar categorías de venta** y agrega las que apliquen.' },
        { q: '¿Qué es «Total Prop.»?', a: 'El total de propinas del día.' }
      ],
      cuidado: [
        'Si el mes está cerrado, no se pueden capturar ni cambiar movimientos de ese mes. Un administrador puede reabrirlo.',
        'Las ventas son la base del Estado de Resultados: si faltan categorías, esa pantalla te lo avisa.'
      ],
      auditoria: 'Los cambios y eliminaciones de ventas, con tu usuario.',
      relacionadas: ['pl', 'flujo', 'guia_excel']
    },
    efectivo: {
      resumen: 'Las cajas de efectivo del negocio, una por moneda, con su saldo y sus movimientos mes por mes. Funciona igual que Bancos, pero para dinero en caja.',
      pasos: [
        'Elige la caja (la moneda) en las etiquetas de arriba. El mes se cambia arriba a la derecha.',
        'Para crear una caja nueva usa **+ Agregar moneda**. Con **Editar** y **Eliminar** administras las que ya tienes.',
        'Para registrar un pago en efectivo, usa **+ Agregar movimiento (pago en efectivo)**.',
        'Para cargar muchos movimientos, usa **Importar movimientos (Excel)**.',
        'Para mover dinero entre una caja y otra cuenta, usa **Transferir**: se crean los dos movimientos con el mismo número TR.'
      ],
      faq: [
        { q: '¿Qué columnas trae el Excel de efectivo?', a: 'Fecha, Descripción, Depósitos y Cargos son las principales. Opcionales: Proveedor, Factura y, para un traspaso, **Tipo** con «Traspaso» y **Cuenta destino**. Hay una guía con todos los formatos en «Todas las pantallas».' },
        { q: '¿Cómo registro que llevé dinero de la caja al banco?', a: 'Con **Transferir**. Eso crea la salida de la caja y el depósito en el banco, con el mismo número TR.' },
        { q: '¿Cómo elimino un traspaso?', a: 'Ábrelo con **⋯ → Eliminar**. La app avisa que elimina los dos movimientos (la salida y el depósito).' },
        { q: '¿Puedo tener varias monedas?', a: 'Sí: cada moneda es una caja distinta, con su propio saldo.' }
      ],
      cuidado: [
        'Un traspaso son **dos movimientos**. Si eliminas uno, se eliminan los dos.',
        'Si el periodo está cerrado, no se pueden importar ni cambiar movimientos de esas fechas.'
      ],
      auditoria: 'Altas, ediciones y eliminaciones de movimientos, con tu usuario y el «antes → después».',
      relacionadas: ['bancos', 'polizas', 'guia_excel']
    },
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
        { q: '¿Qué fecha sugiere la app como «hoy»?', a: 'La de **Cancún** (la hora del negocio), sin importar desde qué zona trabajes ni la hora de tu computadora. Si capturas algo de otro día, cambia la fecha antes de guardar.' }
      ],
      cuidado: [
        'Un traspaso son **dos movimientos** con el mismo número TR. Si eliminas uno, se eliminan los dos.',
        'Si el periodo está cerrado, no se pueden importar ni cambiar movimientos de esas fechas.',
        'Un saldo negativo en una cuenta puente suele significar ventas por capturar, no un error.'
      ],
      auditoria: 'Cada alta, edición o eliminación de un movimiento, cada importación que aplicó reglas y cada conciliación quedan con tu usuario y el «antes → después».',
      relacionadas: ['recurrentes', 'polizas', 'guia_excel']
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
        { q: '¿Qué columnas trae el Excel de facturas?', a: 'Proveedor, Fecha, Factura e Importe. Opcional: Estatus (si empieza con «pag» se toma como pagada). Hay una guía con todos los formatos en «Todas las pantallas».' },
        { q: '¿Se puede programar una factura de proveedor que se repite?', a: 'Todavía no. Está planeado para una próxima versión, con aviso de que esas facturas no llevan CFDI hasta que lo agregues.' }
      ],
      cuidado: [
        'Como orientación general, el IVA de una compra se acredita cuando la factura está **pagada** y, en negocios fiscales, con su CFDI (XML). Confírmalo con tu contador.'
      ],
      auditoria: 'Altas, ediciones, notas de crédito y pagos de facturas, con tu usuario y el «antes → después».',
      relacionadas: ['bancos', 'cfdi', 'guia_excel']
    },
    clientes: {
      resumen: 'Tus clientes y lo que te deben: facturas, órdenes de venta, cobros y notas de crédito.',
      pasos: [
        'Para dar de alta un cliente, usa **+ Agregar cliente**. Con **Editar** y **Eliminar** administras el directorio.',
        'Abre un cliente con **Ver / Editar** para ver sus facturas, su saldo y sus movimientos. **← Volver al directorio** regresa.',
        'Para registrar algo nuevo usa **+ Nueva transacción**: Factura, Orden de venta, Registrar cobro, Nota de crédito o Devolución a cliente.',
        'Las órdenes de venta se convierten en Factura con un clic cuando el cliente confirma (entrega o cobro).'
      ],
      faq: [
        { q: '¿Cuál es la diferencia entre una orden de venta y una factura?', a: 'Las ventas se crean primero como **orden**. Cuando el cliente confirma (entrega o cobro), la orden se convierte en **factura** con un clic.' },
        { q: '¿Cómo registro una devolución o un descuento?', a: 'Con **Nota de crédito** (devolución, descuento o corrección) o **Devolución a cliente**, desde **+ Nueva transacción**.' },
        { q: '¿Qué son los «Días retraso»?', a: 'Los días que han pasado desde el vencimiento de una factura que todavía tiene saldo.' },
        { q: '¿Qué es «Open Balance»?', a: 'Lo que ese cliente todavía te debe.' },
        { q: '¿Cómo registro un cobro?', a: 'Con **Registrar cobro**, desde **+ Nueva transacción**, o desde el movimiento de Bancos o Efectivo cuando el dinero entra.' }
      ],
      cuidado: ['Si el mes está cerrado, no se pueden crear ni cambiar movimientos con fechas de ese mes.'],
      auditoria: 'Altas, ediciones y eliminaciones de clientes, facturas y órdenes de venta, con tu usuario.',
      relacionadas: ['ventas', 'bancos', 'cfdi']
    },
    cfdi: {
      resumen: 'Carga los XML descargados del SAT, los separa en emitidos y recibidos y registra su estatus.',
      pasos: [
        'Primero, el negocio debe tener su **RFC** capturado en Negocios. Sin RFC no se puede saber si un CFDI es emitido o recibido.',
        'Pulsa **Cargar XML del SAT** (ZIP o XML) y elige los archivos.',
        'Busca por RFC, nombre, UUID o folio.',
        '**Clasificar** (o **Volver a clasificar**) liga el comprobante con el registro que le corresponde.',
        '**Estatus con metadata del SAT** marca de golpe los CFDI cancelados con el archivo de metadata del SAT.',
        '**Descargar XML + PDF (ZIP)** baja los comprobantes que estás viendo (máximo 200).'
      ],
      faq: [
        { q: '¿Por qué me avisa que el negocio no tiene RFC?', a: 'Porque el RFC es lo que permite distinguir emitidos de recibidos. Captúralo en **Negocios** y vuelve a entrar a CFDI.' },
        { q: '¿Qué es el «Estatus SAT»?', a: 'Si el comprobante está vigente o cancelado según el SAT.' },
        { q: '¿Qué archivos puedo cargar?', a: 'Archivos XML sueltos o un ZIP con varios.' },
        { q: '¿Cuántos comprobantes bajo en un ZIP?', a: 'Los que estés viendo con tu búsqueda, hasta un máximo de 200.' }
      ],
      cuidado: ['Esta pantalla ordena y consulta tus comprobantes; la validez fiscal la define el SAT. Ante una duda, consulta a tu contador.'],
      auditoria: 'Las cargas, clasificaciones y cambios de estatus de CFDI, con tu usuario.',
      relacionadas: ['proveedores', 'negocios', 'auditoria']
    },
    activosfijos: {
      resumen: 'El equipo y el mobiliario del negocio con su depreciación contable mensual. Aquí das de alta cada activo y ves su cédula de depreciación.',
      pasos: [
        'Para registrar un activo, usa **+ Agregar activo** (costo, vida útil, valor residual y método). **Editar** y **Eliminar** administran los que ya tienes.',
        'La cédula muestra, por activo, la depreciación del periodo, la del ejercicio, la acumulada y su valor neto en libros.',
        '**Ver póliza** abre la póliza de depreciación; **Ver reversión** abre la que la revierte.',
        'Si un activo tiene meses pendientes de póliza, la pantalla lo avisa arriba con «⚠ Pólizas históricas pendientes».'
      ],
      faq: [
        { q: '¿La depreciación se registra sola?', a: 'Sí: la depreciación es mensual y automática, con los parámetros de cada activo.' },
        { q: '¿Qué significa «Pólizas históricas pendientes»?', a: 'Hay meses con depreciación calculada que todavía no tienen su póliza. Revísalos antes de generarlas.' },
        { q: '¿Los importes dependen de que la póliza exista?', a: 'No. Los importes mostrados son el cálculo contable según los parámetros de cada activo, independientemente de si la póliza ya se materializó.' }
      ],
      cuidado: ['Si cambias el costo, la vida útil o el valor residual de un activo, cambian sus depreciaciones futuras. El cambio queda en Auditoría.'],
      auditoria: 'Altas, ediciones y eliminaciones de activos, y las pólizas de depreciación que se generan, con tu usuario.',
      relacionadas: ['polizas', 'configuracion', 'auditoria']
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
        { q: '¿Qué columnas trae el Excel de pólizas?', a: 'Fecha, Concepto, Subcuenta, Descripción, Cargo y Abono. Hay una guía con todos los formatos en «Todas las pantallas».' },
        { q: '¿Qué queda en Auditoría cuando edito una póliza?', a: 'Los cambios de fecha, concepto, cuentas y montos, como «antes → después», con tu usuario.' },
        { q: '¿Por qué no me deja guardar una póliza?', a: 'Normalmente es porque **no cuadra** (cargos distintos de abonos), falta la fecha o el periodo está cerrado.' }
      ],
      cuidado: [
        'La fecha de «hoy» que sugiere la app es la de Cancún, aunque trabajes desde otra zona. Si capturas algo de otro día, cámbiala antes de guardar.',
        'Si cambias una póliza creada por una programada, el cambio no afecta a las que se creen después.'
      ],
      auditoria: 'Crear, editar y eliminar pólizas, con los cambios de fecha, concepto, cuentas y montos como «antes → después».',
      relacionadas: ['recurrentes', 'bancos', 'librodiario']
    },
    librodiario: {
      resumen: 'Todos los asientos del negocio en orden de fecha, con sus cargos y abonos. Sirve para revisar qué se registró en un periodo.',
      pasos: [
        'Elige el rango con **Del día** y **Al día**.',
        'Pulsa **Buscar**. Hasta que lo hagas, la pantalla no calcula nada.',
        'Con **Excel** descargas lo que estás viendo.',
        '**Ver documento** abre el comprobante de un asiento, cuando lo tiene.'
      ],
      faq: [
        { q: '¿Por qué no aparece nada?', a: 'Hay que elegir un rango y pulsar **Buscar**. Si el rango no tiene movimientos, la pantalla lo dice.' },
        { q: '¿Qué columnas muestra?', a: 'Fecha, Referencia, Cuenta, Concepto, Factura o Nota, Cargo y Abono.' }
      ],
      cuidado: ['Esta pantalla solo consulta: para corregir algo, abre el movimiento o la póliza de donde viene.'],
      auditoria: '',
      relacionadas: ['polizas', 'auxiliares', 'balanza']
    },
    diariospolizas: {
      resumen: 'Reúne en pestañas los diarios de pólizas y el Libro Diario, para pasar de uno al otro sin salir de la pantalla.',
      pasos: [
        'Cambia de pestaña para ver los diarios o el Libro Diario.',
        'El mes se elige arriba a la derecha.',
        'En el Libro Diario elige el rango con **Del día** y **Al día** y pulsa **Buscar**.'
      ],
      faq: [],
      cuidado: [],
      auditoria: '',
      relacionadas: ['polizas', 'librodiario', 'auxiliares']
    },
    auxiliares: {
      resumen: 'Los movimientos de una sola cuenta, con su saldo corrido. Sirve para explicar de dónde sale el saldo de una cuenta.',
      pasos: [
        'Elige la **Cuenta**.',
        'Elige el rango con **Desde** y **Hasta**, o usa **Mes seleccionado** o **Año a la fecha**.',
        'Con **Excel** o **PDF** descargas el auxiliar.',
        '**Ver documento** abre el comprobante de un movimiento, cuando lo tiene.'
      ],
      faq: [
        { q: '¿Qué muestra cada columna?', a: 'Fecha, Documento, Concepto o descripción, Factura o Nota, Debe, Haber y el Saldo corrido. Al final se muestra el total del periodo.' },
        { q: '¿Por qué dice «Sin movimientos en este periodo»?', a: 'La cuenta no tiene movimientos en ese rango. Cambia las fechas o usa **Año a la fecha**.' }
      ],
      cuidado: [],
      auditoria: '',
      relacionadas: ['balanza', 'librodiario', 'catalogo']
    },
    comparativo: {
      resumen: 'Ingresos, gastos, utilidad o pérdida y margen de todos tus negocios, lado a lado, para el mismo mes.',
      pasos: [
        'Cambia el mes arriba a la derecha.',
        'Cada fila es un negocio: Total ingresos, Total gastos, Utilidad / Pérdida y Margen.'
      ],
      faq: [{ q: '¿De dónde salen las cifras?', a: 'Son los mismos cálculos que el Estado de Resultados Mensual de cada negocio, uno junto al otro.' }],
      cuidado: [],
      auditoria: '',
      relacionadas: ['pl', 'dashboard']
    },
    pl: {
      resumen: 'Ingresos, costos y gastos del negocio, y cuánto quedó (utilidad o pérdida) en el periodo que elijas.',
      pasos: [
        'Usa las pestañas **Mensual**, **Acumulado** (un rango de meses) y **Todos los meses** (el año completo).',
        'En la vista anual, **Detalle** y **Ejecutivo** cambian qué tanto se desglosa.',
        'Con **Comparar con** ves otro periodo junto al actual, con su variación en $ y en %.',
        'Si hay gastos sin clasificar, ábrelos para ver de qué están hechos y clasificarlos.',
        '**+ Ajuste manual** agrega un ajuste al resultado.'
      ],
      faq: [
        { q: '¿De dónde salen los gastos?', a: 'De las facturas de Proveedores (por su desglose), de las salidas de Bancos y Efectivo marcadas como «Gasto» y de los ajustes manuales.' },
        { q: '¿Puedo ver varios meses a la vez?', a: 'Sí. Con **Acumulado** eliges desde qué mes hasta cuál; con **Todos los meses** ves los doce.' },
        { q: '¿Por qué me pide configurar categorías de venta?', a: 'Porque los ingresos salen de las ventas. Configúralas en Ventas, con **Configurar categorías de venta**.' },
        { q: '¿Qué es «Sin clasificar»?', a: 'Dinero que ya salió pero todavía no tiene una subcuenta de gasto. Clasifícalo para que aparezca donde corresponde.' }
      ],
      cuidado: ['Ventas y gastos de esta pantalla usan la misma fuente que el Flujo de Efectivo: deben coincidir siempre.'],
      auditoria: 'Los ajustes manuales, con tu usuario.',
      relacionadas: ['flujo', 'ventas', 'comparativo']
    },
    flujo: {
      resumen: 'La posición de caja del negocio y el resumen del mes: cuánto entró y cuánto salió.',
      pasos: [
        'El mes se cambia arriba a la derecha.',
        '**Cash Position** muestra cómo está el dinero del negocio.',
        '**Resumen del mes** muestra las ventas y los gastos del mes elegido.'
      ],
      faq: [{ q: '¿Por qué debe coincidir con el Estado de Resultados?', a: 'Porque las ventas y los gastos salen de la misma fuente. Si no coinciden, hay algo que revisar.' }],
      cuidado: [],
      auditoria: '',
      relacionadas: ['pl', 'bancos', 'efectivo']
    },
    balance: {
      resumen: 'Lo que tiene y lo que debe el negocio a una fecha. Por omisión muestra «hoy».',
      pasos: [
        'Elige **Ver balance al cierre de** un mes para verlo a esa fecha.',
        'Pulsa **✕ Ver a hoy** para volver al día de hoy.'
      ],
      faq: [{ q: '¿Por qué el balance no cuadra?', a: 'Revisa primero **Revisión de consistencia** y la **Balanza de Comprobación**: ahí se ve qué está descuadrado o incompleto.' }],
      cuidado: ['Si algo está sin clasificar o descuadrado, el balance lo refleja. Revisa antes de cerrar el mes.'],
      auditoria: '',
      relacionadas: ['revision', 'balanza', 'guia_cierre']
    },
    balanza: {
      resumen: 'La lista de cuentas con sus saldos iniciales, cargos, abonos y saldos actuales. Sirve para comprobar que la contabilidad cuadra.',
      pasos: [
        'El mes se cambia arriba a la derecha.',
        'Si hay diferencia entre cargos y abonos, pulsa **Ver origen de la diferencia**.',
        '**Excel** descarga la balanza. **Vertical**, **Horizontal** e **Imprimir** preparan la hoja.',
        '**Ver documento** abre el comprobante de un movimiento, cuando lo tiene.'
      ],
      faq: [
        { q: '¿Qué hago si hay una diferencia?', a: 'Pulsa **Ver origen de la diferencia**: muestra los movimientos que la generan. Una causa frecuente es un traspaso entre monedas distintas, cuyos dos movimientos no tienen el mismo monto por el tipo de cambio.' },
        { q: '¿Para qué sirve que cuadre?', a: 'Para poder cerrar el periodo: el botón **Cerrar periodo** solo se habilita cuando la balanza cuadra.' }
      ],
      cuidado: [],
      auditoria: '',
      relacionadas: ['revision', 'auxiliares', 'guia_cierre']
    },
    catalogo: {
      resumen: 'La estructura contable del negocio: cuenta mayor › subcuenta › sub-subcuenta. De aquí salen las cuentas que usas en las pólizas.',
      pasos: [
        'Para partir de una base ya lista, usa **Cargar catálogo sugerido**. Si ya tienes tu catálogo en Excel, usa **Subir catálogo (Excel)**.',
        '**+ Agregar cuenta mayor** crea una; al crearla se agrega una subcuenta con el mismo nombre, lista para usarse. **+ Agregar subcuenta** agrega más.',
        '**Descargar catálogo (Excel)** baja tu catálogo actual.',
        'La sección de IVA acreditable lista las cuentas pendientes de clasificar. En **Bancos y Efectivo** se ven las cuentas de dinero del negocio.'
      ],
      faq: [
        { q: '¿Qué hace «Promover a cuenta mayor»?', a: 'Convierte una subcuenta en su propia cuenta mayor, con todo lo que tenga adentro.' },
        { q: '¿Qué es la clasificación de IVA acreditable?', a: 'Una clasificación fiscal que solo aplica a las subcuentas de gasto o costo con IVA.' },
        { q: '¿Puedo tener más de dos niveles?', a: 'Sí. Por ejemplo: Gastos de Operación › Mantenimiento y conservación › Reparación de freidoras.' }
      ],
      cuidado: ['Cambiar o eliminar una cuenta que ya tiene movimientos afecta lo que ya registraste. Los cambios quedan en Auditoría.'],
      auditoria: 'Altas, ediciones, promociones y eliminaciones de cuentas, con tu usuario.',
      relacionadas: ['polizas', 'auxiliares', 'configuracion']
    },
    revision: {
      resumen: 'Qué está descuadrado o incompleto, antes de que llegue al Balance. Conviene revisarla antes de cerrar un mes.',
      pasos: [
        'Se ejecuta al abrirla. Pulsa **Volver a revisar** para repetirla después de corregir algo.',
        'Cada verificación dice «Sin diferencias» o enumera lo que encontró, con su detalle.',
        'Para un pago sin factura, usa **Elegir factura…** y luego **Ligar y aplicar**. La columna «Qué pasaría» te dice el efecto antes de confirmar.'
      ],
      faq: [
        { q: '¿Qué revisa?', a: 'Entre otras cosas: traspasos incompletos o con movimientos repetidos, pólizas descuadradas y pagos sin factura. Cada bloque explica qué significa y cómo se corrige.' },
        { q: '¿Qué hago con un traspaso incompleto?', a: 'Abre el movimiento en Bancos o Efectivo con **⋯ → Editar**, elige la cuenta contraria y guarda: se crea el movimiento que falta.' }
      ],
      cuidado: ['Esta pantalla propone y explica; los cambios que haces desde aquí quedan en Auditoría.'],
      auditoria: 'Los pagos que ligas a una factura desde aquí, con tu usuario.',
      relacionadas: ['bancos', 'balanza', 'guia_cierre']
    },
    auditoria: {
      resumen: 'La bitácora de actividad: quién creó, editó o eliminó cada registro, y cuándo.',
      pasos: [
        'Usa **Buscar** para encontrar una palabra, un monto o un concepto.',
        'Filtra por **Usuario** o por **Acción** para acotar.',
        'Cada fila trae fecha y hora, usuario, acción, módulo y el detalle, normalmente con el «antes → después».'
      ],
      faq: [
        { q: '¿Qué se registra?', a: 'Las altas, cambios y eliminaciones de Pólizas, Proveedores, Clientes, facturas y órdenes de venta, Ventas, CFDI, Catálogo de Cuentas, Activos Fijos, Impuestos y sus papeles, Reglas de importación, Transacciones programadas, Negocios y Configuración, además de las conciliaciones y eliminaciones de movimientos de Bancos.' },
        { q: '¿Cómo encuentro quién cambió un monto?', a: 'Busca el monto o el concepto, o filtra por Módulo y Acción. El detalle muestra el cambio como «antes → después».' },
        { q: '¿Veo la actividad de todos los negocios?', a: 'Esta pantalla muestra la del negocio que tienes elegido arriba a la izquierda.' }
      ],
      cuidado: ['Es de solo lectura: sirve para revisar y no para corregir.'],
      auditoria: '',
      relacionadas: ['configuracion', 'polizas', 'bancos']
    },
    negocios: {
      resumen: 'Alta y perfil de cada negocio del grupo: su nombre, razón social, RFC y si trabaja en modo financiero o fiscal.',
      pasos: [
        'Para crear un negocio, usa **+ Agregar negocio**.',
        '**Editar** abre su perfil: nombre comercial, razón social y los datos del negocio.',
        'Cada negocio tiene botones **Excel** y **JSON** para exportar su información.'
      ],
      faq: [
        { q: '¿Cómo paso un negocio a modo fiscal?', a: 'En el perfil del negocio, cambia su modo a «Fiscal Contable». Así se activan las pantallas de impuestos.' },
        { q: '¿Para qué sirve capturar el RFC?', a: 'En CFDI, el RFC permite saber si un comprobante es emitido o recibido.' },
        { q: '¿Estos botones son un respaldo?', a: 'Son una exportación rápida. Para un respaldo confiable usa **Configuración → Respaldo completo**.' }
      ],
      cuidado: [
        'Los botones **Excel** y **JSON** de cada negocio son una exportación rápida y, en negocios con muchos movimientos, pueden quedar incompletos. Para respaldar, usa el **Respaldo completo**.'
      ],
      auditoria: 'Las altas y los cambios de negocios, con tu usuario.',
      relacionadas: ['configuracion', 'cfdi', 'guia_respaldo']
    },
    configuracion: {
      resumen: 'El centro de herramientas del negocio: cierre de periodo, catálogo, activos fijos, auditoría, respaldo y más. Algunas tarjetas solo las ve un administrador.',
      pasos: [
        'Para todos: **Catálogo de Cuentas**, **Cierre de periodo**, **Revaluación de divisas**, **Activos Fijos**, **Pagos por clasificar**, **Fuentes Fiscales**, **Auditoría** y **Comparativo entre negocios**.',
        'En negocios fiscales: **Control de saldos a favor IVA**.',
        'Solo administradores: **Negocios (todos)**, **Usuarios autorizados**, **Autenticación de dos pasos**, **Respaldo completo** y **Restaurar archivos**.',
        'Abre una tarjeta para ver y usar su herramienta.'
      ],
      faq: [
        { q: '¿Cómo cierro un mes?', a: 'En la tarjeta **Cierre de periodo**. Hay una vista previa de solo lectura y el botón **Cerrar periodo** se habilita cuando la balanza cuadra. Hay una guía completa en «Todas las pantallas».' },
        { q: '¿Qué es «Pagos por clasificar»?', a: 'Salidas de dinero pendientes de asignar a un proveedor o factura, o de clasificar hacia Banco o Efectivo.' },
        { q: '¿Quién puede ver Respaldo, Usuarios y Autenticación de dos pasos?', a: 'Solo los administradores.' },
        { q: '¿Qué hace la revaluación de divisas?', a: 'Activa la revaluación al cierre de lo que debes, te deben y tienes en divisas. Los tipos de cambio se capturan en Parámetros fiscales.' }
      ],
      cuidado: ['Las acciones de esta pantalla afectan a todo el negocio. Si dudas, pregunta antes de cambiar algo.'],
      auditoria: 'Los cambios de configuración, con tu usuario.',
      relacionadas: ['guia_cierre', 'guia_respaldo', 'guia_cuenta']
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
      faq: [], cuidado: [], auditoria: '',
      relacionadas: ['papelestrabajo', 'ivafiscal', 'pagosimpuestos']
    },
    papelestrabajo: {
      aviso: '**Sección en construcción.** Los papeles de trabajo todavía se están terminando. Valida las cifras con quien administra la contabilidad antes de usarlas.',
      resumen: 'Reúne, por pestañas, los papeles que respaldan los cálculos fiscales del negocio: Resumen, ISR, IVA, Pérdidas y Retenciones.',
      pasos: ['Cambia el mes arriba a la derecha.', 'Cambia de pestaña para ver cada papel de trabajo.', 'Cada pestaña tiene su propia dirección: puedes copiar el enlace.'],
      noExplica: 'Cómo se calcula cada papel de trabajo. Esa parte se explicará cuando la sección esté terminada.',
      faq: [], cuidado: [], auditoria: '',
      relacionadas: ['impuestos', 'fuentesfiscales', 'cedulasmaestras']
    },
    ivafiscal: {
      aviso: '**Sección en construcción.** Valida las cifras con quien administra la contabilidad antes de usarlas.',
      resumen: 'Reporte del IVA acreditable (facturas de proveedores), el IVA trasladado (facturas de clientes) y las retenciones. Solo aparece en negocios del modo fiscal.',
      pasos: [
        'Elige **Mes** o **Todos los meses** para ver un mes o el año.',
        'Pulsa **Calcular** para actualizar el reporte. **Excel** y **PDF** lo descargan.',
        'Si el IVA se va a pagar después de su fecha límite, indica en **Se pagará en** el mes de pago, para calcular la actualización.'
      ],
      noExplica: 'Cómo se determina cada cifra. Esa parte se explicará cuando la sección esté terminada.',
      faq: [{ q: '¿Por qué dice que el negocio está en modo Financiero?', a: 'Porque este reporte solo funciona en negocios fiscales. Cambia el modo del negocio a «Fiscal Contable» en Configuración → Negocios.' }],
      cuidado: [], auditoria: '', relacionadas: ['impuestos', 'pagosimpuestos', 'recargos']
    },
    isrprovisional: {
      aviso: '**Sección en construcción.** Valida las cifras con quien administra la contabilidad antes de usarlas.',
      resumen: 'La pantalla del pago provisional de ISR del negocio, por mes. Solo aparece en negocios del modo fiscal.',
      pasos: [
        'Elige **Mes** o **Todos los meses**.',
        'Los ajustes opcionales se agregan con **+ Agregar** y se guardan con **Guardar**.',
        'El coeficiente de utilidad y las pérdidas pendientes se capturan a mano, con su fecha de **Vigente desde**.',
        '**Registrar en Pagos de Impuestos** lo lleva a la pantalla de pagos. **Excel** y **PDF** descargan el reporte.'
      ],
      noExplica: 'Cómo se determina el pago provisional. Esa parte se explicará cuando la sección esté terminada.',
      faq: [], cuidado: [], auditoria: 'Los cambios de esta pantalla, con tu usuario.', relacionadas: ['impuestos', 'pagosimpuestos', 'cedulasmaestras']
    },
    pagosimpuestos: {
      aviso: '**Sección en construcción.** Valida las cifras con quien administra la contabilidad antes de usarlas.',
      resumen: 'Los impuestos del año del negocio, con su fecha límite y su pago. Solo aparece en negocios del modo fiscal.',
      pasos: [
        'Elige el **Año**.',
        'El IVA a cargo de cada mes se agrega solo. Los demás impuestos se registran con **+ Registrar otro impuesto**.',
        '**Aplicar pago de impuestos** registra un pago.',
        'Si la pantalla avisa que hay pólizas pendientes de contabilizar, revisa cada caso antes de usar **Generar**.'
      ],
      noExplica: 'Cómo se determina cada importe. Esa parte se explicará cuando la sección esté terminada.',
      faq: [], cuidado: [], auditoria: 'Los pagos y cambios de impuestos, con tu usuario.', relacionadas: ['impuestos', 'isrprovisional', 'ivafiscal']
    },
    recargos: {
      aviso: '**Sección en construcción.** Es un cálculo de referencia: confirma con tu declaración antes de pagar.',
      resumen: 'El catálogo de INPC y una calculadora de recargos y actualización, para cuando un impuesto se paga después de su fecha límite.',
      pasos: [
        'Elige el **Año a capturar** y captura el INPC y las tasas de cada mes, con **Guardar cambios de INPC** y **Guardar cambios de Tasas**.',
        'En la calculadora, captura el monto del impuesto, cuándo debió pagarse y cuándo se va a pagar, y pulsa **Calcular**.',
        '**Excel** y **PDF** descargan el resultado.'
      ],
      noExplica: 'Cómo se hace el cálculo. Esa parte se explicará cuando la sección esté terminada.',
      faq: [], cuidado: [], auditoria: 'Los cambios de INPC y tasas, con tu usuario.', relacionadas: ['parametrosfiscales', 'ivafiscal', 'pagosimpuestos']
    },
    diasinhabiles: {
      resumen: 'El calendario de días inhábiles fiscales que usa el motor de vencimientos. Aplica a todos los negocios.',
      pasos: [
        'Elige el año.',
        'Agrega un día con **+ Agregar día inhábil**. **Editar** y **Eliminar** administran los que ya existen.'
      ],
      faq: [{ q: '¿Hay que agregar los sábados y domingos?', a: 'No: los sábados y domingos se excluyen automáticamente.' }],
      cuidado: ['Es un calendario global: un cambio aquí aplica a todos los negocios.'],
      auditoria: '', relacionadas: ['parametrosfiscales', 'impuestos']
    },
    fuentesfiscales: {
      aviso: '**Sección en construcción.** Valida la configuración con quien administra la contabilidad.',
      resumen: 'Qué subcuentas contables proponen automáticamente cada concepto de los Papeles de Trabajo.',
      pasos: [
        'La pantalla va por bloques: **A. Mapeo fiscal**, **B. Fuente Ventas**, **C. Fuente Contable** y **D. Resultado**.',
        'Configura qué subcuenta alimenta cada concepto. Si un concepto no tiene mapeo, no hay propuesta.'
      ],
      noExplica: 'Cómo se calcula cada concepto fiscal.',
      faq: [{ q: '¿Puedo seguir capturando a mano?', a: 'Sí: la captura manual sigue disponible aunque exista una fuente configurada.' }],
      cuidado: [], auditoria: '', relacionadas: ['papelestrabajo', 'configuracion', 'catalogo']
    },
    cedulasmaestras: {
      aviso: '**Sección en construcción.** Valida las cifras con quien administra la contabilidad antes de usarlas.',
      resumen: 'Las cédulas propias del contribuyente: control de pérdidas fiscales y PTU, con su historial.',
      pasos: [
        'Registra una pérdida fiscal con **+ Registrar pérdida**.',
        'Registra un evento de PTU con **+ Registrar evento PTU**.',
        'El **Historial** muestra cada movimiento con su fecha y usuario.'
      ],
      noExplica: 'Cómo se calculan los saldos actualizados y aplicados.',
      faq: [], cuidado: [], auditoria: 'Los registros de pérdidas y de PTU, con tu usuario.', relacionadas: ['papelestrabajo', 'isrprovisional', 'impuestos']
    },
    parametrosfiscales: {
      aviso: '**Sección en construcción.** Valida los parámetros con quien administra la contabilidad.',
      resumen: 'Los parámetros fiscales generales, comunes a todos los negocios: tipos de cambio de cierre, días inhábiles, INPC y recargos.',
      pasos: [
        'Cambia de pestaña para ver cada parámetro.',
        'En **Tipos de cambio de cierre**, captura el tipo de cambio del último día de cada mes para cada moneda, con **Agregar moneda** y **Guardar**.',
        'Los días inhábiles y el INPC y recargos se capturan igual que en sus pantallas.'
      ],
      noExplica: 'Cómo se usa cada parámetro en los cálculos.',
      faq: [{ q: '¿Qué falta por agregar aquí?', a: 'La pantalla avisa que están pendientes de implementar la UMA, la UDI y las tarifas de ISR.' }],
      cuidado: ['Son parámetros globales: un cambio aplica a todos los negocios.'],
      auditoria: 'Los cambios de parámetros, con tu usuario.', relacionadas: ['recargos', 'diasinhabiles', 'configuracion']
    }
  },
  guias: {
    guia_mes: {
      titulo: 'Qué hacer cada mes',
      resumen: 'Un orden de trabajo para cerrar el mes, basado en cómo funciona la app. Es una propuesta: no sustituye el criterio de tu contador.',
      pasos: [
        '**Ventas:** captura o importa los días del mes.',
        '**Bancos y Efectivo:** importa los estados de cuenta. Si una regla coincide, confirma las filas.',
        '**Clasifica lo pendiente:** movimientos sin clasificar y, en Configuración, **Pagos por clasificar**.',
        '**Proveedores y Clientes:** registra las facturas y aplica los pagos y cobros.',
        '**CFDI:** carga los XML del mes, si el negocio los usa.',
        '**Pólizas de Diario:** revisa las programadas del mes y registra las que falten.',
        '**Revisión de consistencia:** corrige lo que marque.',
        '**Conciliar** cada cuenta bancaria contra su estado de cuenta.',
        'Revisa la **Balanza de Comprobación** (debe cuadrar) y el **Estado de Resultados**.',
        'Si todo cuadra: **Configuración → Cierre de periodo → Cerrar periodo**.'
      ],
      faq: [
        { q: '¿Puedo cerrar un mes si la balanza no cuadra?', a: 'No. El botón **Cerrar periodo** se deshabilita y la vista previa te muestra la diferencia.' },
        { q: '¿Qué hago si necesito corregir un mes ya cerrado?', a: 'Pide a un Administrador, Propietario, Socio o Gerencia que lo reabra en **Configuración → Cierre de periodo**.' },
        { q: '¿El orden es obligatorio?', a: 'No, pero conviene: lo que capturas primero es lo que luego concilias y revisas.' }
      ],
      cuidado: ['Antes de cerrar, revisa que no queden movimientos sin clasificar ni traspasos incompletos.'],
      auditoria: '',
      relacionadas: ['revision', 'guia_cierre', 'guia_excel']
    },
    guia_excel: {
      titulo: 'Qué columnas debe traer cada Excel',
      resumen: 'Cada importación reconoce columnas por su nombre, sin distinguir mayúsculas ni acentos. Estas son las que reconoce cada una.',
      pasos: [
        '**Bancos y Efectivo:** Fecha, Descripción, Depósitos (o Abono) y Cargos (o Cargo). Opcionales: Concepto y Referencia; en Efectivo, Proveedor y Factura.',
        '**Traspasos en el mismo archivo:** agrega la columna **Tipo** con «Traspaso» y la columna **Cuenta destino**.',
        '**Facturas de proveedores:** Proveedor, Fecha, Factura e Importe. Opcional: Estatus (si empieza con «pag» se toma como pagada).',
        '**Catálogo de proveedores:** Nombre Comercial (o Nombre), Razón social y RFC.',
        '**Pólizas:** Fecha, Concepto, Subcuenta, Descripción, Cargo y Abono.',
        '**Ventas:** descarga la **plantilla** desde Ventas; trae las columnas de tus categorías.',
        '**Catálogo de cuentas:** descarga el catálogo actual con **Descargar catálogo (Excel)** y úsalo como formato.'
      ],
      faq: [
        { q: '¿Importan las mayúsculas o los acentos en los nombres de las columnas?', a: 'No. «Depósitos», «depositos» y «DEPÓSITOS» se reconocen igual.' },
        { q: '¿Qué pasa con las filas que ya existían?', a: 'En Bancos y Efectivo se omiten solas, para no duplicar.' },
        { q: '¿Qué pasa si falta una columna principal?', a: 'La app avisa cuál falta o que no encontró filas válidas, y no importa nada.' }
      ],
      cuidado: ['Usa fechas reales de Excel en la columna de fecha y números sin símbolos en los importes.'],
      auditoria: '',
      relacionadas: ['bancos', 'proveedores', 'polizas']
    },
    guia_cierre: {
      titulo: 'Cierre de periodo',
      resumen: 'Cerrar un mes lo bloquea: ya no se pueden crear, importar ni cambiar movimientos con fechas de ese mes.',
      pasos: [
        'Entra a **Configuración → Cierre de periodo** y elige el mes.',
        'Revisa la **vista previa**: es solo de lectura y te dice si la balanza cuadra.',
        'Si cuadra, pulsa **Cerrar periodo**. Si no, el botón queda deshabilitado y se muestra la diferencia.',
        'Para volver a editar ese mes, pulsa **Reabrir** en la lista de cierres.'
      ],
      faq: [
        { q: '¿Qué bloquea un periodo cerrado?', a: 'La captura, las importaciones y los cambios con fecha de ese mes. La app avisa «El periodo … ya está cerrado» y dice a quién pedirle que lo reabra.' },
        { q: '¿Quién puede reabrir un periodo?', a: 'Un Administrador, Propietario, Socio o Gerencia.' },
        { q: '¿Qué hace «Reabrir ejercicio»?', a: 'En un cierre de ejercicio, elimina únicamente la póliza automática de cierre y desbloquea sus 12 meses. Ninguna operación capturada se pierde.' },
        { q: '¿Qué pasa con las pólizas programadas de un mes cerrado?', a: 'No se crean hacia atrás: quedan «no creadas» y se crean solas, con su fecha, si el periodo se reabre.' }
      ],
      cuidado: ['Cierra el mes solo cuando la balanza cuadre y no queden movimientos sin clasificar.'],
      auditoria: 'Los cierres y las reaperturas de periodo.',
      relacionadas: ['balanza', 'revision', 'configuracion']
    },
    guia_respaldo: {
      titulo: 'Respaldo y restauración',
      resumen: 'Cómo guardar una copia de la información y cómo recuperar archivos. Estas herramientas son solo para administradores.',
      pasos: [
        'Entra a **Configuración → Respaldo completo** y pulsa **Descargar respaldo**.',
        'El respaldo es un ZIP con las tablas de Finanzas de todos los negocios que puedes ver. Solo lee: no cambia nada.',
        'Para recuperar adjuntos y XML de CFDI, usa **Configuración → Restaurar archivos**: **Solo comprobar** te dice qué falta y **Subir los que falten** los vuelve a subir.'
      ],
      faq: [
        { q: '¿Restaurar archivos sobrescribe algo?', a: 'No. Solo vuelve a subir los que faltan, y antes puedes comprobar.' },
        { q: '¿Cada cuándo conviene bajar un respaldo?', a: 'Antes de cambios grandes y al cerrar cada mes, y guárdalo fuera de la computadora de trabajo.' },
        { q: '¿Sirven los botones Excel y JSON de Negocios como respaldo?', a: 'Son una exportación rápida y, en negocios con muchos movimientos, pueden quedar incompletos. Para respaldar usa el **Respaldo completo**.' }
      ],
      cuidado: ['Guarda el respaldo en un lugar seguro: contiene información financiera de tus negocios.'],
      auditoria: '',
      relacionadas: ['configuracion', 'negocios', 'guia_cuenta']
    },
    guia_cuenta: {
      titulo: 'Cuenta y seguridad',
      resumen: 'Cómo se protege tu acceso y quién define a qué negocios entra cada persona.',
      pasos: [
        'La **autenticación de dos pasos** se activa en **Configuración → Autenticación de dos pasos → Activar**. Esa tarjeta la ven los administradores.',
        'Con ella activada, cada vez que inicies sesión se te pide también el código de tu app de autenticación.',
        'Quién puede entrar a Finanzas y a qué negocios lo define un administrador en **Configuración → Usuarios autorizados**.',
        'Todo lo que haces queda en **Auditoría** con tu usuario.'
      ],
      faq: [
        { q: '¿Qué pasa si desactivo la autenticación de dos pasos?', a: 'Tu cuenta queda protegida solo con tu contraseña. La app te pide confirmar antes de desactivarla.' },
        { q: '¿Por qué no veo algunos negocios?', a: 'Porque cada persona solo ve los negocios que un administrador le asignó.' },
        { q: '¿Por qué no veo la tarjeta de Respaldo o de Usuarios?', a: 'Son solo para administradores.' }
      ],
      cuidado: ['No compartas tu usuario ni tu código de autenticación: todo lo que se haga con tu cuenta queda registrado a tu nombre.'],
      auditoria: 'Los cambios de configuración, con tu usuario.',
      relacionadas: ['configuracion', 'auditoria', 'guia_respaldo']
    }
  },
  grupos: [
    { t: 'Guías paso a paso', k: ['guia_mes', 'guia_excel', 'guia_cierre', 'guia_respaldo', 'guia_cuenta'] },
    { t: 'Operación diaria', k: ['dashboard', 'ventas', 'efectivo', 'bancos', 'proveedores', 'clientes', 'cfdi'] },
    { t: 'Contabilidad', k: ['polizas', 'pl', 'flujo', 'balance', 'librodiario', 'diariospolizas', 'auxiliares', 'balanza', 'catalogo', 'activosfijos', 'revision'] },
    { t: 'Automatización', k: ['recurrentes'] },
    { t: 'Fiscal · en construcción', solo: 'fiscal', k: ['impuestos', 'papelestrabajo', 'ivafiscal', 'isrprovisional', 'pagosimpuestos', 'cedulasmaestras', 'parametrosfiscales', 'fuentesfiscales', 'recargos', 'diasinhabiles'] },
    { t: 'Control', k: ['auditoria', 'comparativo', 'negocios', 'configuracion'] }
  ]
};
