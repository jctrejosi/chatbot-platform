# Análisis de costos — segunda versión (comercial) (`whatsapp-bot-platform`)

**Fecha de corte:** 29-oct-2026. Último commit de la segunda versión (comercial): 23-oct-2026.
**Moneda:** COP, con equivalencia a USD a **3.200 COP/USD** (dólar observado 3.143; se usa 3.200 como margen de seguridad).
**Alcance:** costo **incurrido hasta hoy**: horas de la primera versión del desarrollo (investigación) y de la segunda versión (comercial), más costos de operación y comerciales. No incluye trabajo futuro ni proyecciones.
**Fuentes:** precios DeepSeek y Meta WhatsApp Business (oct-2026); infraestructura: **VDS de Contabo** (8 vCPU / 32 GB / 240 GB NVMe) a **US$68 + IVA = US$80,92/mes**, que contratamos y administramos.

---

## 0. Marco de este análisis

| Repositorio | Rol | ¿Cómo entra en el costo? |
|---|---|---|
| `whatsapp-bot-platform` — **segunda versión (comercial)** | **Producto oficial.** Es lo que se comercializa. | **Horas + producto.** Es el objeto del análisis |
| `chatbot-platform` — **primera versión del desarrollo (investigación)** | **Investigación.** No se comercializa. | **Solo sus horas**, incluidas en el total de desarrollo (A.1). No se evalúa como producto |

**Qué significa “hasta hoy”:** horas efectivamente trabajadas —primera versión del desarrollo (investigación) y segunda versión (comercial)—, valoradas a tarifa. No hay estimaciones de trabajo pendiente ni de trabajo futuro.

**Qué queda fuera:** el resultado de la primera versión del desarrollo (investigación) como producto —no se comercializa ni se compara con la segunda versión (comercial)— y todo lo que todavía no se ha ejecutado. La operación (B) y lo comercial (C) se presentan aparte, porque son costos de otra naturaleza.

### Cómo se separan los costos

| Bloque | Qué incluye | Naturaleza |
|---|---|---|
| **A. Desarrollo** | Horas de personas construyendo software: **primera versión del desarrollo (investigación) + segunda versión (comercial)** | Pago único, ya incurrido |
| **B. Operación del producto (costo directo)** | WhatsApp, IA, servidor, base de datos y almacenamiento | Variable / mensual |
| **C. Comercial** | Identidad de marca, publicidad, ventas, soporte, legal, pasarela | Pago único + mensual |
| **D. Indicadores unitarios** | Costo por conversación y margen por escenario | Derivado de B y F |
| **E. Palancas y verificación** | Qué se puede reducir y qué falta confirmar | Revisión de supuestos |
| **F. Factura al cliente** | Precio de venta por bot y margen: no es un costo, es B más el margen | Derivado de A, B y C |

Dentro de **B** van aparte: **B.1 WhatsApp**, **B.2 LLM**, **B.3 Infraestructura**, **B.4 Totales**, **B.5 Costo de un bot** y **B.6 Infraestructura por cliente**.

---

## 1. Resumen ejecutivo

| Bloque | Concepto | Valor |
|---|---|---|
| **A** | **Desarrollo hasta hoy** (investigación + producto) | **COP $16,56M** (US$5.176) por 130 h |
| **B** | **1 bot a 100 conversaciones/día**, WhatsApp, IA e infraestructura incluidos | **US$13,57–19,99/mes** (COP $43.438–63.958) |
| **B** | El mismo bot a 70 conversaciones/día | **US$10,21–14,70/mes** (COP $32.674–47.038) |
| **B** | El mismo bot a 20 conversaciones/día | **US$4,60–5,89/mes** (COP $14.734–18.838) |
| **B** | Infraestructura de 1 bot | **US$2,31/mes** (COP $7.398) |
| **B** | Bots de 100 conversaciones que caben en un VDS | **35** |
| **C** | Comercial de entrada (pago único) | **COP $6M–27,8M** |
| **C** | Comercial recurrente | **COP $2,6M–18,2M/mes** + comisiones + pasarela |
| **F** | Factura al cliente, bot típico | **COP $129.000/mes** (US$40,31) |

**Tres conclusiones:**

1. **El desarrollo hasta hoy costó COP $16,56M:** 130 h valoradas a COP $127.400/h, de las cuales 56 son de la primera versión del desarrollo (investigación) y 74 de la segunda versión (comercial).
2. **Recibir mensajes es gratis e ilimitado; lo que se paga es lo que el bot envía fuera de la ventana.** El cliente escribe primero, así que las respuestas del bot no cuestan. Se paga la **utilidad** (2 plantillas por conversación, a US$0,0008) y la **publicidad** (4 envíos al mes, a US$0,0125). A 100 conversaciones diarias eso son US$4,80 de utilidad + US$0,05 de publicidad. La **IA** (US$6,41–12,83) es la partida dominante: entre el **47% y el 64%** del costo.
3. **El costo escala con las conversaciones, no con los clientes.** Es lineal en utilidad y en IA: US$4,60–5,89/mes a 20 conversaciones diarias, US$10,21–14,70 a 70 y US$13,57–19,99 a 100. La infraestructura (US$2,31) y la publicidad (US$0,05) son fijas. Un VDS de US$80,92 sostiene **35 bots**; para crecer se agrega otro VDS igual. **COP $129.000/mes** cubre el bot típico con margen; el detalle está en F.

---

## 2. Metodología y supuestos

| Supuesto | Valor | Por qué |
|---|---|---|
| Tarifa de desarrollo | COP $127.400/h | **Tarifa combinada**: punto medio de cada banda de mercado, ponderado por las horas; se descompone en **A.0** |
| Trabajo no registrado en git | +35% | Reuniones, pruebas manuales, despliegues, soporte |
| **Un bot = un cliente** | 1 | Es la unidad de todo el bloque B y de la factura F |
| **Conversaciones por bot (caso típico)** | **70 al día** → **2.100 al mes** | 70 × 30 días; el informe ejecutivo usa 100 al día (3.000 al mes) como referencia |
| **Respuestas por conversación** | 5 | → **10.500 mensajes del bot/mes** |
| **Traspasos a un asesor** | 20% de las conversaciones | Se resuelven dentro de la ventana, así que **no cuestan** |
| **Utilidad** | **2 plantillas por conversación** | 70/día → 4.200 al mes; 100/día → 6.000 al mes |
| **Publicidad** | **4 envíos al mes** | Fija, no depende del volumen |
| **Utilidad dentro de la ventana de 24 h** | **US$0** | Meta no cobra la plantilla de utilidad con ventana de servicio abierta; aquí se calcula como techo (cobradas) para no subestimar |
| **Almacenamiento inicial por bot** | **5 GB** | Cuota asignada en el VDS (B.6.2) |
| **Infraestructura** | **VDS de Contabo: 8 vCPU, 32 GB, 240 GB NVMe · US$68 + IVA = US$80,92/mes** | Lo contratamos y lo administramos nosotros (B.3) |
| **Bots por servidor** | **35** | Tope realista con la cuota de 5 GB y el sistema instalado (B.3.2) |
| **Modelo de WhatsApp** | **Cuenta de empresa, un número por cliente** | La plataforma paga el consumo a Meta; el cliente no abre cuenta |
| Ventana de 24 h | Respuestas dentro de la ventana: **gratis** | El cliente casi siempre escribe primero |
| Tipo de cambio | **3.200 COP/USD** | Dólar observado 3.143; se usa 3.200 como margen |
| Tarifa de utilidad (WhatsApp) | **US$0,0008/mensaje** | Meta, por plantilla de utilidad entregada |
| Tarifa de publicidad (WhatsApp) | **US$0,0125/mensaje** | Meta, por plantilla de publicidad entregada |
| Tarifa de IA (`deepseek-chat`) | **US$0,15/M de tokens** fuera de pico · **US$0,30/M** en pico | Precio por millón de tokens (entrada + salida) |
| Tokens por conversación | **14.250** (13.500 de entrada + 750 de salida) | 5 respuestas por conversación |

**Justificación de cada hora:** se usaron cuatro cruces:
1. **Evidencia física:** líneas y archivos reales (`git ls-files` + `wc -l`).
2. **Complejidad:** integraciones externas, asincronía, seguridad, parsing de formatos.
3. **Historial:** timestamps de commits y número de iteraciones.
4. **Perfil y tecnología:** mezcla ponderada de perfiles que exige el stack (**A.0**).

---

# A. COSTOS DE DESARROLLO

## A.0 Justificación de la tarifa por hora

Todas las cifras de este bloque dependen de una sola variable: **COP $127.400 por hora**. Esta sección la sostiene con **las tecnologías que realmente se usaron**, no con un promedio de mercado genérico.

La tesis es simple: **el stack del desarrollo exige competencias que no vienen juntas** (desarrollo completo senior, seguridad y mensajería regulada, interfaz con roles, infraestructura y algo de IA aplicada), y encima alguien que coordine. Cuando eso no existe en una sola persona, se paga una **tarifa combinada** — y esa tarifa es más cara que un perfil intermedio genérico.

### A.0.1 El stack real (verificado en código, no en el pitch)

| Capa | Tecnología encontrada | Evidencia | Qué exige del desarrollador |
|---|---|---|---|
| Programación | **Node.js + Express 5; Python 3.12 + FastAPI** | `apps/api/index.js` 884 líneas; `knowledge-service/main.py` y `services/` | Recepción de avisos de Meta sin duplicar mensajes, validación de sesión, errores asíncronos y un servicio HTTP en un segundo lenguaje |
| Interfaz de usuario | **React 19 + Vite 8 + Tailwind 4** | `apps/web/package.json`; `AdminBotPanel.jsx` 889, `UserDashboard.jsx` 702 | Aplicación de una sola página con roles, sesión y visor de conversaciones |
| Base de datos | **PostgreSQL 16 + pgvector** con índice HNSW | `infra/postgres/init.sql`; imagen `pgvector/pgvector:pg16` | Datos separados por cliente **y** búsqueda vectorial en la misma base de datos |
| Mensajería | **WhatsApp Cloud API**, Graph **v23.0** | `worker.js` → `graph.facebook.com/v23.0/{id}/messages` | Ventana de 24 h, plantillas aprobadas, credencial de acceso por cliente |
| LLM | **DeepSeek** (`deepseek-chat`) con el cliente de OpenAI | `worker.js` | Control de `max_tokens`, tamaño del historial y del contexto |
| Vectores | **@xenova/transformers** (ONNX en Node) | `ingestionWorker.js` | Modelo en RAM, procesamiento por lotes, límites de CPU del proceso en segundo plano |
| Carga de documentos | **pdf-parse** | `apps/api/package.json` | Lectura defensiva de PDFs reales (escaneados, corruptos, enormes) |
| Extracción de documentos (investigación) | **PyMuPDF, pdfplumber, python-docx/xlsx/pptx/xlrd, LibreOffice headless** | `knowledge-service/requirements.txt`, `Dockerfile` | 40+ formatos y contenedores pesados |
| Seguridad | **JWT + bcryptjs + AES-256-GCM** | `utils/secrets.js` | Aislamiento entre clientes y cifrado de credenciales de Meta |
| Infraestructura | **Docker Compose (5 servicios) + nginx + verificaciones de estado; GitHub Actions con ejecutor propio** | `docker-compose.yml`; `.github/workflows/ci-cd.yml` | Orquestación, arranque ordenado, proxy y despliegue validado por cada cambio sin tumbar producción |

**Lectura:** no es “una landing con un chatbot”. Es una plataforma con datos separados por cliente, mensajería regulada, búsqueda vectorial, despliegue continuo y un servicio de aprendizaje automático en Python. Ese conjunto no lo cubre un junior ni un freelance de interfaz.

### A.0.2 Tarifa de mercado por perfil (Colombia, 2026)

| Perfil | COP/hora | Qué aporta a este stack |
|---|---|---|
| Junior de desarrollo completo | $35.000–55.000 | Operaciones básicas y componentes; no autenticación por cliente ni recepción de mensajes |
| Intermedio (2–4 años) | $60.000–90.000 | Interfaz de programación y de usuario con supervisión |
| Senior de desarrollo completo (5+) | $110.000–160.000 | Diseño de la interfaz de programación, colas, seguridad y esquema de datos |
| Especialista en IA / búsqueda semántica | $140.000–200.000 | Vectores, instrucciones del modelo, evaluación de calidad, costo por token |
| DevOps / infraestructura | $120.000–170.000 | Compose, nginx, CI/CD, backups, observabilidad |
| Coordinación / arquitectura | $100.000–140.000 | Alcance, priorización, criterios de aceptación |
| **Agencia / software factory** | **$180.000–300.000** | Lo mismo + gestión, garantía y margen |

> Rangos estimados para Colombia. Conviene validarlos con 3–5 cotizaciones antes de usarlos en una negociación.

### A.0.3 La tarifa usada es combinada, y sale de la mezcla real de horas

Ponderación sobre las **130 h de desarrollo** de A.1 (investigación + producto):

| Tipo de trabajo | % de horas | Perfil | Banda de mercado (COP/h) | Punto medio (COP/h) | Aporte (COP) |
|---|---|---|---|---|---|
| IA / búsqueda semántica (carga de documentos, vectores, instrucciones del modelo) | 17% | Especialista en IA | $140.000–200.000 | $170.000 | $28.900 |
| Interfaz de programación, colas y seguridad | 21% | Senior de desarrollo completo | $110.000–160.000 | $135.000 | $28.350 |
| Interfaz de usuario (panel y tablero) | 20% | Intermedio | $60.000–90.000 | $75.000 | $15.000 |
| Infraestructura, base de datos, contenedores, despliegue continuo | 19% | Infraestructura | $120.000–170.000 | $145.000 | $27.550 |
| Descubrimiento, pruebas manuales, documentación y coordinación | 23% | Senior / coordinación | $100.000–140.000 | $120.000 | $27.600 |
| **Promedio ponderado** | **100%** | | | | **COP $127.400** |

La mezcla agrupa los módulos de A.3 —de la segunda versión (comercial)— y las líneas de investigación de A.4 —de la primera versión del desarrollo (investigación)—, repartiendo las horas observadas de cada fase con las proporciones de esfuerzo de sus módulos.

**Esta tabla se corta por tipo de trabajo, no por módulo, y no es una segunda contabilidad de las horas.** La última fila no es un módulo: es el tiempo que no deja un archivo propio (descubrimiento, pruebas manuales, documentación, coordinación). En A.3 no aparece como fila porque esas horas ya están dentro del **+35% de trabajo no registrado en git** repartido entre los módulos; aquí se separa solo para asignarle una tarifa de perfil, porque ese trabajo lo hace alguien más caro que quien escribe código. Las dos tablas describen las mismas 130 h desde dos ángulos, y la única cifra que se usa hacia abajo es la tarifa.

El punto medio de cada banda, ponderado por las horas, da **COP $127.400/h**. Esa es la tarifa aplicada: un solo número, reproducible. Las bandas de A.0.2 quedan como referencia de mercado, pero el costo se calcula con esta tarifa.

**Por qué no $50.000/h:** a esa tarifa se compra un junior, y el junior no toma las decisiones que este stack exige (ventana de 24 h, aislamiento entre clientes, cifrado de tokens, idempotencia de la recepción de mensajes). El costo no desaparece: se paga igual, solo que más tarde y como correcciones.

**Por qué no $180.000–300.000/h:** esa es la tarifa de agencia, que incluye gestión, garantía y margen. Aquí el equipo es interno y asume su propio riesgo.

---

## A.1 Horas de desarrollo (hasta hoy)

| Fase | Repositorio | Qué aporta | Horas |
|---|---|---|---|
| **Investigación** | `chatbot-platform` — primera versión del desarrollo (investigación) | Exploración de búsqueda semántica, extracción de documentos, herramientas del modelo y traspaso a un asesor | 56 |
| **Producto** | `whatsapp-bot-platform` — segunda versión (comercial) | Construcción de la plataforma que se comercializa | 74 |
| **Total** | | **Horas de desarrollo** | **130** |

**Costo a COP $127.400/h:** 56 h de la primera versión del desarrollo (investigación) = COP $7,13M; 74 h de la segunda versión (comercial) = COP $9,43M. **Total: COP $16,56M** (US$5.176 a 3.200 COP/USD).

**Cómo se leen las horas de la primera versión del desarrollo (investigación):** son horas de desarrollo reales (111 commits, 10 días activos), medidas con la misma regla de A.2, y **cuentan como horas de desarrollo**. No se evalúan como producto, no se comparan con la segunda versión (comercial) y no entran en los bloques B ni C. El detalle está en **A.4**.

**Cómo se leen las horas de la segunda versión (comercial):** 44 commits, 9 días activos, 54,6 h medidas + 35% de trabajo no registrado = **74 h**. El detalle está en **A.2** y **A.3**.

## A.2 Evidencia de las horas de la segunda versión (comercial)

| Métrica | Valor | Cómo se obtuvo |
|---|---|---|
| Periodo | 20-sep → 23-oct-2026 (5 semanas) | `git log --date` |
| Commits | 44 | `git log --oneline` |
| Días con commits | 9 | fechas únicas |
| Líneas de código finales | 6.080 | `git ls-files` + `wc -l`, sin lockfiles |
| Líneas añadidas / eliminadas | 23.956 / 15.175 | `git log --numstat` |
| Commits de corrección o reescritura | 9 (20%) | palabras en el mensaje: `fix`, `refactor`, `hotfix` |
| Jornadas medidas | 54,6 h | primer → último commit de cada día |
| Trabajo que no deja registro en git (+35%) | **74 h** | reuniones, pruebas manuales, despliegue, soporte |

**Cómo se miden las horas:** git registra commits, no tiempo. Para cada uno de los 9 días con actividad se toma el intervalo entre el primer y el último commit, se le suma **1 hora** de trabajo que no dejó registro y se topa a **8 horas**; un día con un solo commit cuenta **2 horas**. La suma da 54,6 h visibles. Es una medición, no una estimación libre, y si algo subestima: el trabajo anterior al primer commit y posterior al último solo se cuenta como una hora.

## A.3 Qué se construyó en la segunda versión (comercial) y cómo se reparten sus 74 h

Git no registra tiempo por archivo, así que las horas **se asignan** según el peso de cada módulo. El peso se calculó con líneas de código + integraciones externas; el total está anclado en las 74 h medidas, no en una estimación independiente. Cada módulo recibe **peso × 74 h**.

| # | Módulo | Evidencia (líneas) | Peso | Horas asignadas |
|---|---|---|---|---|
| 1 | Arquitectura, base de datos y separación de datos por cliente | `init.sql` 68 | 13% | 9,6 |
| 2 | Autenticación, roles, cifrado de credenciales e interfaz de programación de bots y administración (24 rutas) | `auth` 121 + `secrets.js` ~120 + `index.js` 884 | 19% | 14,1 |
| 3 | WhatsApp: recepción de mensajes, envío, cola y traspaso a un asesor | `worker.js` 327 | 9% | 6,7 |
| 4 | Carga de documentos e indexación de vectores local | `ingestionWorker.js` 187 + 21 | 6% | 4,4 |
| 5 | Interfaz: inicio de sesión, panel de administración, tablero y visor de conversaciones | 1.182 + 1.050 = 2.232 | 30% | 22,2 |
| 6 | Infraestructura y herramientas de desarrollo: contenedores, proxy, empaquetado y despliegue continuo | 469 + 1.034 = 1.503 | 23% | 17,0 |
| | **Total** | **6.080** | **100%** | **74,0 h** |

Cada fila suma 5.463 líneas; el resto hasta 6.080 son archivos de configuración, dependencias y migraciones que no son trabajo de módulo.

**Por qué no hay filas de control de calidad, documentación ni coordinación:** esas tareas no dejan un archivo que se pueda contar, así que darles un porcentaje sería inventar horas. Además, las 74 h **ya incluyen el +35% de trabajo no registrado de A.2** (reuniones, pruebas manuales, despliegue, soporte), que es justo ese trabajo. Asignarles otro 13% y otro 8% dentro del total las contaba dos veces. Por eso su peso se repartió entre los módulos que sí tienen código.

## A.4 La primera versión del desarrollo (investigación)

| Línea de investigación | Evidencia | Resultado |
|---|---|---|
| Búsqueda semántica con pgvector | `knowledge-service/` (2.941 líneas) | Probado, con dos modos: vectores o reordenamiento |
| Extracción de 40+ formatos | `extraction.py` 784 líneas + LibreOffice | Probado |
| Troceado con solape | `chunking.py` 313 líneas | Probado |
| Vectores de OpenAI, 512 dimensiones | `embedding.py` 96 líneas | Descartado a favor del modelo local |
| Reordenamiento con DeepSeek | `reranker.py` 139 líneas | Probado |
| Herramientas del modelo + validación | `functions.js` 562 líneas, 7 funciones | Probado |
| Varios bots sin autenticación | `settings.js` + `bot-manager.js` | Descartado: el producto requiere autenticación |
| Interfaz monolítica | `App.jsx` 1.598 líneas | Descartado |

| Tiempo observado | Valor |
|---|---|
| Periodo | 31-jul → 18-sep-2026 |
| Commits | 111 |
| Días con commits | 10 |
| Horas visibles | 41,5 h |
| Horas con trabajo no registrado (+35%) | **56 h** |
| Líneas de código finales | 11.258 |
| Commits de corrección o reescritura | 72 (65%), con `fix`, `refactor` o `hotfix` en el mensaje |

**Cómo cuenta en este documento:** las 56 h **suman al total de A.1**, porque fueron horas de desarrollo. No se evalúan como producto, no se comparan con la segunda versión (comercial) y no se les imputa nada más: ni costos de operación (B) ni comercialización (C).

**Cómo leer el bloque A:** el costo de desarrollo hasta hoy es **COP $16,56M** (130 h a COP $127.400/h, investigación incluida). De esas horas, **74 corresponden a la segunda versión (comercial)** y se reparten por módulo en A.3; las **56 restantes corresponden a la primera versión del desarrollo (investigación)** y solo cuentan como horas (A.4), no como producto.

---

# B. COSTOS OPERATIVOS DEL PRODUCTO (COSTO DIRECTO)

Todo lo que cuesta **entregar** el servicio: WhatsApp, IA e infraestructura. Es el costo directo de operación —el que existe mes a mes mientras el bot atiende— y no incluye desarrollo (A) ni comercial (C).

## B.1 WhatsApp (sección independiente)

### B.1.1 La regla que manda: quién escribe primero

- **Recibir mensajes: gratis e ilimitado.** El cliente puede escribir todo lo que quiera; Meta no cobra por recibir.
- **Responder dentro de la ventana de 24 h: gratis e ilimitado.** Cada mensaje del cliente abre 24 horas; todo lo que el bot conteste en esa ventana es mensaje de servicio y no se cobra, sin tope.
- **Plantilla de utilidad: se cobra por mensaje entregado**, a US$0,0008. Es la plantilla que inicia el negocio (confirmación, cambio de estado, aviso de entrega). Si cae dentro de la ventana de 24 h abierta por el cliente, Meta no la cobra; aquí se contabiliza como si se cobrara, para no subestimar.
- **Plantilla de publicidad: siempre se cobra**, a US$0,0125 por mensaje entregado. No hay ventana que la cubra.
- Fuera de la ventana solo se puede escribir con plantilla. Colombia es mercado propio en la hoja de tarifas de Meta.

**Consecuencia:** el número de conversaciones no mueve el costo de recibir ni de responder. Lo mueve lo que el bot envía por iniciativa propia: la utilidad (2 por conversación) y la publicidad (4 al mes). Por eso WhatsApp pesa mucho menos de lo que parecía.

### B.1.2 Qué cuesta un bot (100 conversaciones al día)

| Concepto | Volumen/mes | Tarifa | Costo/mes |
|---|---|---|---|
| Mensajes recibidos | ilimitados | US$0 | **US$0** |
| Respuestas del bot (dentro de la ventana) | 15.000 | US$0 | **US$0** |
| Plantillas de utilidad | 6.000 | US$0,0008 | **US$4,80** |
| Plantillas de publicidad | 4 | US$0,0125 | **US$0,05** |
| **Total WhatsApp por bot** | | | **US$4,85** |

**Utilidad: 2 por conversación. Publicidad: 4 al mes.** Un bot de 100 conversaciones diarias (3.000 al mes) envía 6.000 plantillas de utilidad y 4 de publicidad. La utilidad es la partida de WhatsApp que crece con el volumen; la publicidad es fija.

> **Convención del documento:** la utilidad se contabiliza como si **siempre se cobrara** (US$0,0008), aunque Meta no cobra la que cae dentro de la ventana de 24 h. Es la cifra prudente: el costo real de WhatsApp por bot está entre US$0,05 (solo publicidad) y US$4,85 (toda la utilidad cobrada), y en cualquier caso no es la partida que decide el precio.

### B.1.3 De dónde salen las 6.000 de utilidad

La utilidad acompaña a la conversación: en promedio **2 plantillas por conversación** (por ejemplo, confirmación y aviso de entrega). Es una estimación por volumen, no una medición de pedidos.

| Base | Cálculo | Resultado |
|---|---|---|
| Utilidad al mes (100/día) | 2 × 3.000 conversaciones | **6.000** |
| Utilidad al mes (70/día) | 2 × 2.100 conversaciones | **4.200** |
| Publicidad | 4 envíos al mes | **4** |

Si en la práctica son 1 o 3 plantillas por conversación, el renglón de utilidad se mueve en proporción; la unidad que hay que medir en el registro propio (B.1.4) es el número real de plantillas entregadas.

### B.1.4 Cómo lo pagamos y cómo lo controlamos

La cuenta de WhatsApp Business es **nuestra**, con un número por cliente y nuestra tarjeta: el cliente nunca ve una factura de Meta.

| Punto | Qué implica |
|---|---|
| Meta factura por cuenta | El desglose por bot se reconstruye con un registro propio de mensajes entregados |
| Sin tarjeta vigente no salen plantillas | Las respuestas en ventana no dependen de eso; los avisos de utilidad, sí |
| El riesgo de impago es nuestro | Pagamos a Meta aunque el cliente no pague: cobro anticipado o corte |
| Tope por bot | Un tope de plantillas evita que una campaña se coma el margen (E.1) |

**Por qué no una cuenta por cliente:** le traslada verificación de negocio, método de pago y límites. El costo de Meta es el mismo en los dos modelos; lo que cambia es quién controla la cuenta, y aquí la controlamos nosotros.

> **Tarifas usadas (firmes):** utilidad **US$0,0008** por mensaje entregado; publicidad **US$0,0125** por mensaje entregado. Fuente: Meta, *Precios de la plataforma de WhatsApp Business* (cobro por mensaje entregado). Recibir y responder dentro de la ventana de 24 h no genera cargo.

## B.2 IA / LLM

Un bot, 100 conversaciones al día, **5 respuestas por conversación**. Con esa base se calcula el costo de una conversación, el de un día, el del mes y cómo crece de 20 en 20 conversaciones (B.2.5).

### B.2.1 Precio del token (`deepseek-chat`, oct-2026)

| Concepto | Fuera de pico | Hora pico |
|---|---|---|
| Precio por 1M de tokens (entrada + salida) | US$0,15 | US$0,30 |

- **Hora pico** = 01:00–04:00 y 06:00–10:00 UTC de lunes a viernes = **20:00–23:00 y 01:00–05:00 en Colombia**.
- El horario laboral colombiano es **fuera de pico: mitad de precio**. Por eso el rango realista es el extremo bajo.
- Se usa **una sola tarifa por millón de tokens** (entrada + salida sumadas), sin distinguir entrada de salida.

### B.2.2 Costo de una conversación

Cada respuesta usa ~2.700 tokens de entrada (historial de 12 mensajes + 7 fragmentos de la base de conocimiento) y ~150 de salida. Una conversación son 5 respuestas:

| Unidad | Tokens | Fuera de pico | Hora pico |
|---|---|---|---|
| Una respuesta | 2.850 | US$0,00043 | US$0,00086 |
| **Una conversación (5 respuestas)** | **14.250** | **US$0,0021** | **US$0,0043** |

### B.2.3 Un día de 1 bot: 100 conversaciones

| Concepto | Cálculo | Resultado |
|---|---|---|
| Conversaciones | — | 100 |
| Respuestas | 100 × 5 | 500 |
| Tokens | 100 × 14.250 | **1,43 millones** |
| Costo del día | tarifa por token sobre esos 1,43M tokens | **US$0,21–0,43** |

Un bot que atiende 100 personas en un día consume alrededor de **1,43 millones de tokens** y cuesta **entre 21 y 43 centavos de dólar**.

### B.2.4 Un mes de 1 bot: 3.000 conversaciones

| Concepto | Cálculo | Resultado |
|---|---|---|
| Conversaciones | 100 × 30 días | **3.000** |
| Respuestas | 3.000 × 5 | **15.000** |
| Tokens | 3.000 × 14.250 | **42,75 millones** |
| Costo del mes | tarifa por token sobre esos 42,75M tokens | **US$6,41–12,83** |
| Costo de IA por 1.000 conversaciones | 14,25M tokens | US$2,14–4,28 |

Por bot, la IA cuesta **US$6,41–12,83 al mes**: es la partida dominante del costo directo (**47–64%** del total), porque WhatsApp solo cobra utilidad y publicidad, no las respuestas.

**Palancas:** `max_tokens` explícito, historial más corto, menos fragmentos por consulta y caché del prefijo (las instrucciones fijas del sistema no cambian, así que se cobran más baratas). Cada palanca mueve el costo por conversación, y por eso se mide en esa unidad.

### B.2.5 Cómo crece el costo de IA: de 20 en 20 conversaciones al día

La IA crece **en línea recta**: cada conversación cuesta lo mismo, así que duplicar conversaciones duplica el costo. La tabla usa la base de B.2.2 —14.250 tokens por conversación— y la tarifa plana de B.2.1.

| Concepto | 20/día | 40/día | 60/día | 80/día | 100/día |
|---|---|---|---|---|---|
| Conversaciones/mes | 600 | 1.200 | 1.800 | 2.400 | 3.000 |
| Respuestas del bot/mes | 3.000 | 6.000 | 9.000 | 12.000 | 15.000 |
| **Tokens totales/mes** | **8,55M** | **17,10M** | **25,65M** | **34,20M** | **42,75M** |
| **Costo de IA/mes** | **US$1,28–2,57** | **US$2,57–5,13** | **US$3,85–7,70** | **US$5,13–10,26** | **US$6,41–12,83** |
| Costo de IA/día | US$0,04–0,09 | US$0,09–0,17 | US$0,13–0,26 | US$0,17–0,34 | US$0,21–0,43 |
| Crecimiento frente a 20/día | 1× | 2× | 3× | 4× | 5× |

**Cómo se lee:** cada 20 conversaciones diarias adicionales suman **8,55 millones de tokens y US$1,28–2,57 al mes**. El costo del día se obtiene dividiendo el mes en 30; el de cualquier otro volumen, con la fórmula:

> **Tokens/mes** = conversaciones al día × 30 × 14.250
> **Costo/mes** = tokens/mes ÷ 1M × US$0,15–0,30

Aplicada a 140 conversaciones al día (fuera de la tabla): 4.200 conversaciones, 59,85M tokens y **US$8,98–17,96 al mes**. El crecimiento es lineal hasta el punto en que se acorten el historial o los fragmentos por consulta (E.1), que es lo único que baja el costo **por** conversación.

**Qué mueve el precio:** con 5 respuestas por conversación, la mayoría de los tokens son de entrada (historial + fragmentos de la base de conocimiento). Un bot que responda con menos contexto baja el costo sin tocar el precio de lista; uno que suba a 8 respuestas por conversación lo sube un 60% sin mover el volumen.

## B.3 Infraestructura (VDS propio)

No usamos plataformas gestionadas para el producto. Todo corre en un **VDS de Contabo** que contratamos y administramos nosotros: 8 núcleos AMD EPYC 7282, 32 GB de RAM, 240 GB NVMe y puerto de 500 Mbit/s, sobre Debian 12. El costo es por máquina, no por servicio ni por asiento. Cada bot ocupa una cuota de 5 GB y el resto del servidor es holgura que administramos nosotros.

### B.3.1 Qué entrega el VDS de US$68 + IVA

| Recurso | Capacidad | Para qué |
|---|---|---|
| CPU | 8 núcleos virtuales AMD EPYC 7282 a 2,8 GHz | interfaz de programación, procesos en segundo plano, carga de documentos, base de datos |
| RAM | 32 GB | base de datos, modelo de vectores, Node |
| Disco | 240 GB NVMe | sistema operativo, contenedores, documentos, vectores, historial |
| Red | puerto de 500 Mbit/s | mensajes de Meta e interfaz de programación |
| Sistema operativo | Debian 12 | base del servidor |

| Concepto | Valor |
|---|---|
| Precio de lista | US$68,00/mes |
| IVA (19%) | US$12,92/mes |
| **Costo mensual** | **US$80,92** (COP $258.944) |

**Sobre el IVA:** si la empresa es responsable de IVA, esos US$12,92 se descuentan y el costo neto vuelve a US$68. Aquí se cuenta completo para no subestimar. Todos los cálculos siguientes usan **US$80,92**.

### B.3.2 Capacidad real: cuántos bots caben

Los 240 GB no son para los clientes: el sistema operativo, los contenedores y la base de datos consumen una parte antes de que entre el primer bot.

| Concepto | Espacio |
|---|---|
| Disco nominal (Contabo) | 240 GB |
| Equivalente que reporta el sistema (240 ÷ 1,0737) | 223,5 GB |
| Reserva del sistema de archivos (5%) | −11,2 GB |
| Swap (archivo de intercambio) | −4,0 GB |
| Debian 12 + utilidades | −1,8 GB |
| Docker + imágenes (api, base de datos, panel) | −2,0 GB |
| Caché de compilación | −2,0 GB |
| PostgreSQL (clúster base + registro de transacciones) | −1,5 GB |
| Caché del modelo de vectores | −0,2 GB |
| Registros, temporales y actualizaciones | −1,8 GB |
| **Disponible para datos de clientes** | **~199 GB** |

Con esos 199 GB, el número de bots depende de cuánto ocupe cada uno:

| Ocupación promedio por bot | Bots en 199 GB | Bots con 12% de reserva (175 GB) |
|---|---|---|
| 5,0 GB (cuota llena) | 39 | **35** |
| 3,5 GB (con documentos) | 56 | 50 |
| 2,0 GB (chat y pocos documentos) | 99 | 87 |

**El número de planeación es 35 bots.** Deja 24 GB libres (12%) para que la base de datos compacte, el registro de transacciones crezca y las actualizaciones del sistema no se queden sin espacio.

**Por qué no 50:** 50 bots × 5 GB = 250 GB, más de lo que tiene el disco antes de instalar Debian. Solo cabrían si nadie llena su cuota, y entonces la cuota de 5 GB sería un adorno. Con 35 bots la promesa se cumple.

**Qué consume un bot:**

| Recurso | Consumo | Peso en el servidor |
|---|---|---|
| Disco | **5 GB** | 2,5% de 199 GB |
| CPU | ~0,05 vCPU promedio | menos de 1% de 8 núcleos |
| RAM | ~0,2 GB | menos de 1% de 32 GB |
| Red | <100 MB/mes | incluido |

**La CPU y la RAM no son el límite.** 35 bots × 100 conversaciones al día son 3.500 conversaciones y 17.500 mensajes del bot al día: 0,2 mensajes por segundo en promedio. PostgreSQL usa ~4 GB, los tres procesos de Node ~1 GB y el modelo de vectores ~0,3 GB: unos 6 GB de 32. **El recurso escaso es el disco**, y por eso la cuota se mide en GB y no en mensajes.

**Si un bot crece:** 1.000 conversaciones diarias generan ~150 MB de historial al mes (150.000 mensajes), o **3,6 GB en los 24 meses de retención**. Sigue cabiendo en la cuota; lo que se dispara con ese volumen es WhatsApp y la IA (B.1 y B.2), no el servidor.

### B.3.3 Cuánto cuesta la infraestructura de un cliente

El VDS cuesta US$80,92 y sostiene 35 bots. Ese es el costo de la infraestructura de un bot:

| Componente | Cálculo | Costo/mes |
|---|---|---|
| Servidor repartido entre los bots que caben | US$80,92 ÷ 35 | **US$2,31** |
| *Descompuesto:* | | |
| Parte fija (CPU, RAM, sistema, dominio, holgura) | US$2,31 − (5 × US$0,337) | US$0,62 |
| Disco | 5 GB × (US$80,92 ÷ 240 GB) = 5 × US$0,337 | US$1,69 |
| **Infraestructura de 1 bot** | | **US$2,31** |

**El costo por GB es US$0,337/mes (COP $1.079).** Es casi el triple del servidor anterior (US$0,12/GB), porque el VDS de Contabo tiene menos disco por dólar. Eso sube la infraestructura de un bot de US$0,62–0,72 a US$2,31, pero sigue siendo la partida menor frente a la IA (US$6,41–12,83).

**Cómo se aplica:** todo bot paga **US$0,62 de parte fija** más **US$0,337 por GB** ocupado. Con 5 GB son US$2,31; con 10 GB, US$4,00; con 25 GB, US$9,06.

**Por qué se reparte el servidor y no solo el disco:** si solo se cobrara el disco, el bot de 5 GB costaría US$1,69 y los otros US$0,62 (sistema, base de datos, CPU, holgura) no aparecerían en ningún lado. Repartir el servidor completo entre los bots que caben es lo que refleja el costo real de atenderlos.

### B.3.4 Cómo escala el servidor

| Situación | Qué hacemos | Efecto en el costo por bot |
|---|---|---|
| El servidor tiene menos de 35 bots | Nada | US$2,31 |
| Se llega a 35 bots | Se contrata otro VDS idéntico | US$2,31 |
| Un bot crece en almacenamiento | Bloques de 10 GB | +US$3,37 a costo |
| Un bot crece en mensajes | Nada: el chat es texto | Sin cambio |

**El costo por bot no depende de cuántos haya.** Cuando la máquina se llena se contrata otro VDS idéntico y la cuota de cada bot sigue costando lo mismo. Cuántos bots caben y cuándo se amplía es información nuestra: el cliente ve su espacio, no la infraestructura.

**El crecimiento es por escalones de 35 bots.** No hay punto medio: el VDS se paga completo aunque tenga 3 bots. Con 3 clientes la infraestructura cuesta US$26,97 por bot; con 35, US$2,31. La rentabilidad llega con la ocupación.

### B.3.5 Comparación con proveedores gestionados

| Opción | Costo/mes | Disco | Qué cubre |
|---|---|---|---|
| Render Standard (2 GB) | US$25 | — | Un servicio; base de datos aparte |
| Supabase Pro | US$25 | 8 GB | Base de datos; cómputo para procesos en segundo plano aparte |
| **VDS Contabo 8/32/240** | **US$80,92** | **240 GB** | **interfaz de programación + procesos en segundo plano + base de datos + carga de documentos + nginx** |
| Equivalente gestionado (AWS/GCP/Azure) | US$150–300 (estimado) | — | Cómputo + base gestionada, sin operar servidor |

Por menos de la mitad de un equivalente gestionado, el VDS entrega 32 GB de RAM y 240 GB de disco. **El ahorro se paga en tiempo**: parches, respaldos, monitoreo y disponibilidad son nuestros. Ese costo no es caja y por eso no está en B; se cubre con el soporte de C.2.

**Costo oculto de la plataforma:** el proceso de carga de documentos mantiene el modelo de vectores en RAM y procesa en serie. Un PDF de 300 páginas puede tardar minutos y frenar la cola. En un VDS propio eso se paga en **CPU y latencia**, no en factura.

## B.4 Totales operativos según el volumen

Un bot, un mes. El consumo de WhatsApp y de IA crece con las conversaciones; la infraestructura no.

| Concepto | 20/día | 40/día | 60/día | 80/día | 100/día |
|---|---|---|---|---|---|
| Conversaciones/mes | 600 | 1.200 | 1.800 | 2.400 | 3.000 |
| Respuestas del bot/mes | 3.000 | 6.000 | 9.000 | 12.000 | 15.000 |
| Tokens/mes | 8,55M | 17,10M | 25,65M | 34,20M | 42,75M |
| WhatsApp: utilidad (2 por conversación) | US$0,96 | US$1,92 | US$2,88 | US$3,84 | US$4,80 |
| WhatsApp: publicidad | US$0,05 | US$0,05 | US$0,05 | US$0,05 | US$0,05 |
| IA | US$1,28–2,57 | US$2,57–5,13 | US$3,85–7,70 | US$5,13–10,26 | US$6,41–12,83 |
| Infraestructura | US$2,31 | US$2,31 | US$2,31 | US$2,31 | US$2,31 |
| **Total/mes** | **US$4,60–5,89** | **US$6,85–9,41** | **US$9,09–12,94** | **US$11,33–16,46** | **US$13,57–19,99** |

**Cómo se lee:** la utilidad acompaña a la conversación (2 por conversación, a US$0,0008), la publicidad son 4 envíos fijos al mes (US$0,05) y la infraestructura es una cuota fija de 5 GB. Duplicar conversaciones duplica la IA y la utilidad, no la máquina. La columna de tokens y la de IA son las mismas de **B.2.5**.

**Dónde cae el caso base:** 100 conversaciones al día es la última columna, y da **US$13,57–19,99** (B.5).

**Qué manda en el total:** la IA, que es la partida dominante en todo el rango (**47–64%** del total). WhatsApp aporta entre US$1,01 y US$4,85 (utilidad + publicidad) y la infraestructura se queda fija en US$2,31.

## B.5 Costo de un bot, paso a paso (1 bot = 1 cliente)

**El caso base:** un cliente, un bot, 100 conversaciones al día, 5 GB de almacenamiento, sobre nuestro VDS de US$80,92.

### B.5.1 Cálculo mensual

| Paso | Cálculo | Resultado |
|---|---|---|
| 1. Conversaciones al mes | 100 × 30 días | **3.000** |
| 2. Mensajes que envía el bot | 3.000 × 5 respuestas | **15.000** |
| 3. De esos, dentro de la ventana de 24 h | 15.000 (el cliente escribió primero) | **US$0** |
| 4. Plantillas que inicia el negocio | 6.000 utilidad + 4 publicidad | 6.004 |
| 5. WhatsApp | 6.000 × US$0,0008 + 4 × US$0,0125 | **US$4,85** |
| 6. IA | 42,75M tokens × US$0,15–0,30 / M | **US$6,41–12,83** |
| 7. Infraestructura | cuota de 5 GB del bot (B.3.3) | US$2,31 |
| **Costo del bot** | 5 + 6 + 7 | **US$13,57–19,99** |

Los totales se calculan con las cifras sin redondear; por eso sumar las partidas ya redondeadas puede dar unos centavos de diferencia.

### B.5.2 El mismo cálculo por día

| Por día | Cálculo | Resultado |
|---|---|---|
| Conversaciones | — | 100 |
| Mensajes del bot | 100 × 5 | 500 |
| WhatsApp: mensajes en ventana | 500 × US$0 | **US$0** |
| Utilidad | 200 × US$0,0008 | US$0,16 |
| Publicidad | 4 ÷ 30 ≈ 0,13 × US$0,0125 | ≈ US$0,002 |
| IA | 1,43M tokens × US$0,15–0,30 / M | US$0,21–0,43 |
| Infraestructura | US$2,31 ÷ 30 | US$0,08 |
| **Costo por día** | | **US$0,45–0,67** |

Por día, el bot cuesta entre **45 y 67 centavos de dólar**. Treinta días de eso dan las cifras de B.5.1.

### B.5.3 Qué cambia si el bot atiende más o menos

El costo variable es lineal en conversaciones: cada una suma **US$0,0037–0,0059** (IA + utilidad), mientras que la infraestructura (US$2,31) y la publicidad (US$0,05) son fijas. La escala completa está en **B.4**: de **US$4,60–5,89** con 20 conversaciones al día a **US$13,57–19,99** con 100.

## B.6 Infraestructura de un cliente: cuánto cobrar

La base es la de B.3.3: **un bot ocupa 5 GB y cuesta US$2,31/mes**. Eso es lo que se factura; el resto de la máquina no entra en la factura del cliente.

### B.6.1 Precio de la infraestructura de un cliente

| Concepto | Costo/mes | Precio sugerido | Margen |
|---|---|---|---|
| **Infraestructura + 5 GB** | US$2,31 | **COP $20.000** (US$6,25) | 63% |
| Bloque adicional de 10 GB | US$3,37 | COP $40.000 (US$12,50) | 73% |
| 25 GB (base + 2 bloques) | US$9,06 | COP $100.000 (US$31,25) | 71% |
| 100 GB | US$34,34 | COP $400.000 (US$125,00) | 73% |

**Qué cubre COP $20.000:** la cuota de 5 GB, con 63% de margen. El cliente paga espacio, no capacidad del servidor: cuántos bots caben en la máquina y cuándo se amplía es asunto nuestro (B.3.4).

**Cómo se forma el costo:** cada GB de disco cuesta **US$0,337/mes** (US$80,92 ÷ 240 GB) y cada bot paga **US$0,62** de parte fija. El bloque de 10 GB cuesta US$3,37 y se cobra COP $40.000 (US$12,50).

**El precio no depende del volumen de conversaciones.** Un cliente de 70 conversaciones al día consume los mismos 5 GB que uno de 10: el chat es texto. Si el volumen crece mucho, compra bloques de 10 GB; si el servidor se llena, agregamos otro VDS. Por eso la infraestructura se cobra por almacenamiento y no por mensaje.

**Peso en la factura:** COP $20.000 son el **15,5%** del plan de COP $129.000. El resto es plataforma, IA, WhatsApp y margen; la infraestructura no es lo que encarece el producto.

### B.6.2 Qué incluye el almacenamiento inicial (5 GB)

La cuota es **por bot**: un cliente con 3 bots tiene 15 GB. Los 5 GB se reparten así:

| Uso | Espacio | Equivale a |
|---|---|---|
| Documentos y adjuntos | 4 GB | ~600 PDFs de 7 MB o ~40 de 100 MB |
| Vectores e índices de búsqueda | 0,5 GB | ~250.000 fragmentos indexados |
| Historial de chats | 0,3 GB | ~360.000 mensajes (24 meses a 15.000/mes) |
| Notificaciones, avisos de Meta y registros | 0,2 GB | ~90 días de eventos |
| **Total** | **5 GB** | |

**Reglas de uso:**
- Al 80% se avisa al cliente. Al 100% no se corta el servicio: se amplía un bloque de 10 GB y se ajusta la factura.
- El cliente nunca se queda sin poder cargar un documento; lo que cambia es el precio del bloque adicional.
- Retención por defecto: chats 24 meses, registros 90 días. Lo que sale por retención libera cuota.
- El respaldo va aparte y se cobra por GB (B.6.3): **no consume la cuota** del cliente.

**Por qué 5 GB alcanza:** a 100 conversaciones al día se generan **15.000 mensajes al mes**, unos 15 MB de texto. Los 0,3 GB del historial cubren los 24 meses de retención con holgura. El consumo real son los documentos de la base de conocimiento: 200–300 PDFs caben sin problema; contratos escaneados de 100 MB obligan a comprar bloques desde el inicio.

### B.6.3 Respaldos: cuánto cobrar por GB

El respaldo es un servicio **opcional** que se factura aparte, midiendo lo que el cliente ocupa.

**Dónde se guarda: fuera del VDS.** Un respaldo en el mismo disco no protege de la falla del disco ni del servidor. Se usa almacenamiento de objetos externo (Backblaze B2, Cloudflare R2 o un segundo VDS pequeño).

| Dónde se guarda | Costo real por GB/mes |
|---|---|
| Almacenamiento de objetos externo (B2) | US$0,006 (COP $19) |
| Almacenamiento de objetos externo (R2) | US$0,015 (COP $48) |
| En el VDS (240 GB) | US$0,337 (COP $1.079) |

**Precio: COP $2.000 por GB al mes**, mínimo 1 GB, redondeando al GB superior.

| Espacio ocupado por el cliente | Se factura | Precio | Costo (externo) | Margen |
|---|---|---|---|---|
| 0,8 GB | 1 GB | $2.000 | US$0,006 | 99% |
| 3,0 GB | 3 GB | $6.000 | US$0,018 | 99% |
| 5,0 GB | 5 GB | $10.000 | US$0,030 | 99% |
| 25 GB | 25 GB | $50.000 | US$0,15 | 99% |

**Reglas:**
- Se mide una vez al día y se factura el promedio del mes, al GB superior.
- Mínimo facturable: 1 GB (COP $2.000). Un cliente que ocupa 200 MB paga $2.000.
- El respaldo es opcional: si el cliente no lo contrata, no se le cobra y asume el riesgo.
- Qué se respalda: base de datos, documentos y credenciales cifradas. **No** se respaldan los vectores (se reconstruyen desde los documentos) ni las imágenes de los contenedores.
- Con deduplicación, 1 GB ocupado produce ~1,1 GB de respaldo; ese 10% lo absorbe el margen.
- Retención: 7 días incluidos en el precio; 30 o 90 días se cotizan como plan aparte (COP $10.000 y $20.000/mes por bot).

**Por qué COP $2.000 y no COP $4.000:** COP $4.000/GB es la tarifa del almacenamiento vivo (COP $20.000 por 5 GB). El respaldo se cobra a la mitad para que no se perciba como cobro doble y para incentivar que el cliente lo contrate. Aun así deja 99% de margen si se guarda fuera del VDS; si se guardara dentro, el margen cae a 46%.

**Ejemplo, cliente que ocupa 3 GB:**

| Línea | Detalle | Precio | Nuestro costo |
|---|---|---|---|
| Almacenamiento | 5 GB del plan (ocupa 3) | COP $20.000 | US$2,31 |
| Respaldo | 3 GB × COP $2.000 | COP $6.000 | US$0,02 |
| **Total** | | **COP $26.000** (US$8,13) | **US$2,33** |

Margen: **71%**. Si el cliente ocupa los 5 GB de su cuota, el respaldo son COP $10.000 y el total COP $30.000.

**Con 100 clientes:** 100 × 3 GB = 300 GB de respaldo. Cuesta US$1,80 al mes en almacenamiento externo y se factura COP $600.000 (US$187,50).

---

# C. COSTOS COMERCIALES (sección independiente)

No son costos del producto ni del desarrollo. Van aparte porque dependen de la estrategia de venta.

## C.1 Pago único

| Concepto | Rango |
|---|---|
| Investigación de mercado / ICP | COP $0–4,8M |
| Identidad de marca (logo, colores, tipografía) | COP $1,5M–6M |
| Landing page + copy | COP $1M–4M |
| Material comercial (deck, demo, video) | COP $0,5M–2M |
| Legal: términos, privacidad, DPA, contratos | COP $2M–8M |
| Registro de marca (opcional) | COP $1M–3M |
| **Total** | **COP $6M–27,8M** |

## C.2 Recurrente

| Concepto | Rango mensual |
|---|---|
| Publicidad digital | COP $1M–8M |
| Soporte y acompañamiento de entrada (0,1–0,25 persona por cada 20–30 clientes) | COP $1,2M–4M |
| Gestión de clientes y herramientas | COP $100k–400k |
| Contabilidad/impuestos | COP $300k–800k |
| Ferias/eventos/viajes | COP $0–5M |
| **Subtotal** | **COP $2,6M–18,2M** |

## C.3 Pasarela de pagos

| Concepto | Valor |
|---|---|
| Comisión típica (Wompi/MercadoPago/Stripe) | 2,9–3,5% |
| Costo fijo por transacción | COP $900–1.500 |
| Ejemplo: 50 clientes a COP $129.000 | 3,5% × 6,45M + 50 × 900 = **COP $270.750/mes** |

## C.4 Comisiones de venta

| Modelo | Costo |
|---|---|
| 10–20% del primer año | Ej. cliente de COP $1,55M/año → COP $155k–310k de pago único |
| 1–2 meses de MRR | Ej. COP $129k–258k por cliente |

**Comercial no se mezcla con el costo directo.** Un error común es restar publicidad del margen bruto; el margen bruto debe calcularse solo con B (producto). C se resta después, para obtener el margen neto.

---

# D. Costos e indicadores unitarios

| Métrica | Segunda versión (comercial) | Humano |
|---|---|---|
| Costo IA por respuesta | US$0,00043–0,00086 | — |
| Costo WhatsApp por respuesta en ventana | **US$0** | — |
| Costo por plantilla de utilidad | US$0,0008 | — |
| Costo por plantilla de publicidad | US$0,0125 | — |
| Costo por conversación (5 respuestas + 2 utilidades) | **US$0,0037–0,0059** | **US$0,50–1,25** |
| Costo por 1.000 conversaciones (métrica unitaria) | **US$3,7–5,9** | **US$500–1.250** |
| Ahorro vs humano | **99–99,8%** | — |
| Peso de la IA en el costo total | **47–64%** | — |

El ahorro se calcula cruzando los extremos (peor caso del bot contra el mejor del humano y viceversa); de ahí que el rango sea ancho. En el punto medio, ~99,5%. El costo por conversación suma la IA (14.250 tokens) más 2 plantillas de utilidad; la publicidad (4 al mes) y la infraestructura son fijas y no se reparten aquí.

**Lectura:** el costo lo decide la IA, no el canal: a 100 conversaciones diarias el bot cuesta **US$13,57–19,99** y Meta solo aporta **US$4,85** (utilidad + publicidad). El margen depende del volumen del bot, no de cuántos clientes haya, y está tabulado en **F.6**.

---

# E. Palancas de reducción y verificación

## E.1 Palancas

| Palanca | Ahorro | Esfuerzo |
|---|---|---|
| `max_tokens` explícito en `worker.js` | Evita respuestas de 4.000 tokens | 2 h |
| Historial de 12 → 8 mensajes | −30% de tokens de entrada por respuesta | 2–4 h |
| Fragmentos por consulta 7 → 4–5 | −25% de tokens de entrada | 2–4 h |
| Caché del prefijo (instrucciones fijas) | Reduce los tokens de entrada cobrados cuando acierta la caché | 2–4 h |
| Carga de documentos por lotes y fuera de hora pico | −50% del tiempo de carga | 8–16 h |
| Tope de plantillas y campañas por bot | Evita que una campaña se coma el margen | 4–8 h |
| Límite de peticiones y cuota por bot | Evita abuso de la credencial | 4–8 h |
| Registro del consumo (`usage`) por mensaje | Visibilidad del costo real | 8–16 h |

## E.2 Qué verificar antes de cerrar números

1. **Que los mensajes de servicio dentro de la ventana sigan siendo gratis** en la hoja de Meta para Colombia. Es el supuesto que más mueve el costo: si las respuestas se cobraran, el bot subiría de US$13,57–19,99 a bastante más al mes.
2. **Plantillas de utilidad reales por conversación:** el cálculo asume 2 por conversación. El primer mes de registro (medición de plantillas entregadas) dará el dato real.
3. **Tokens reales por mensaje:** hoy no se registra `usage`; el primer mes de instrumentación dará el dato.
4. **Volumen real:** 15.000 respuestas del bot por cliente/mes (100 conversaciones al día × 5 respuestas), todas dentro de la ventana. Si el bot inicia conversaciones —campañas, reactivaciones— esas sí se cobran, y por eso van aparte.
5. **Tipo de cambio:** 3.200 COP/USD.
6. **Alcance de “desarrollo”:** no incluye diseño de marca, contenido, legal ni soporte post-lanzamiento.
7. **Fecha de corte:** 29-oct-2026. Cualquier trabajo posterior a esa fecha debe entrar como una evaluación nueva, no como ajuste a este documento.

---

# F. Factura estimada al cliente (por bot)

Este es el cierre del análisis: **qué se le factura a un cliente por un bot**, línea por línea, con el costo directo que hay detrás de cada línea. Todo lo anterior (A, B, C) existe para poder llenar esta tabla sin inventar precios.

## F.1 Tres reglas de la factura

1. **El consumo de WhatsApp va dentro del precio.** La cuenta de WhatsApp Business es nuestra y la pagamos nosotros: el cliente no registra tarjeta en Meta ni recibe facturas de Meta (B.1.4). Y como el cliente escribe primero, las respuestas del bot cuestan US$0.
2. **Todo lo que escala tiene tope escrito.** El plan cubre 2.100 conversaciones y 4.204 plantillas (4.200 de utilidad + 4 de publicidad); por encima se sube de plan. Las campañas se cotizan aparte porque son la única forma de que el costo de WhatsApp crezca.
3. **La infraestructura se cobra por almacenamiento, no por mensaje.** 5 GB iniciales por bot; el chat es texto y no consume cuota de forma relevante (B.6.2).

## F.2 El bot típico que se factura

| Variable | Valor | De dónde sale |
|---|---|---|
| Conversaciones/día | 70 | §2 (plan Típico; B usa 100/día como referencia) |
| Conversaciones/mes | 2.100 | 70 × 30 días |
| Mensajes del bot/mes | 10.500 | 2.100 × 5 respuestas |
| Plantillas (utilidad + publicidad) | 4.204 | 4.200 de utilidad (2 por conversación) + 4 de publicidad |
| Respuestas de IA | 10.500 | una por mensaje del bot |
| Almacenamiento | 5 GB | B.6.2 |
| Consumo de WhatsApp que pagamos | US$3,41/mes | 4.200 × US$0,0008 + 4 × US$0,0125 (techo; US$0,05 si las utilidades caen en ventana) |

## F.3 La factura mensual

Costo directo del bot típico (70 conversaciones al día), con la infraestructura incluida (B.5). El caso de referencia de B (100 conversaciones al día) corresponde al plan Activo de F.4.

| # | Línea | Qué incluye | Costo directo/bot | Precio | Margen |
|---|---|---|---|---|---|
| 1 | **Infraestructura del bot** | Servidor y **5 GB** de almacenamiento (B.6) | US$2,31 | **COP $20.000** (US$6,25) | 63% |
| 2 | **Plataforma + IA** | Panel, monitoreo y 10.500 respuestas de IA | US$4,49–8,98 | **COP $90.000** (US$28,13) | 68–84% |
| 3 | **Gestión de WhatsApp** | Número del cliente en nuestra cuenta, 4.200 plantillas de utilidad y 4 de publicidad | US$0,05–3,41 | **COP $19.000** (US$5,94) | 43–99% |
| | **Total recurrente, bot típico** | | **US$10,21–14,70** | **COP $129.000** (US$40,31) | **63–75%** |

Aparte del plan: **almacenamiento adicional**, COP $40.000 por cada 10 GB sobre los 5 GB base (B.6.1); **respaldos**, COP $2.000 por GB al mes (B.6.3); y **campañas**, a la tarifa de Meta más 30%.

**Cómo se lee cada línea:**
- **Línea 1** es la cuota de 5 GB del bot (US$2,31). Es la única línea que no depende del uso.
- **Línea 2** es la que manda: la IA cuesta US$4,49–8,98, o sea **casi la mitad del costo total** del bot.
- **Línea 3** cubre la operación del número y las 4.204 plantillas. El costo va de US$0,05 (si las utilidades caen dentro de la ventana de 24 h) a US$3,41 (si se cobran todas); por eso el margen es ancho, del 43% en el techo al 99% en el caso normal.

**De dónde sale COP $129.000:** del costo (US$10,21–14,70) más el margen que sostiene el soporte y el acompañamiento de entrada. No hay una partida escondida: la IA es la partida dominante y WhatsApp aporta entre US$0,05 y US$3,41.

**Si el bot pasa de 70 conversaciones al día:** el margen del plan Típico cae a 59–72% con 80 y a 50–66% con 100. Para eso está el plan Activo (COP $169.000), que a 100 conversaciones deja 62–74%.

## F.4 Planes según el uso

| Plan | Conversaciones/mes | Conversaciones/día | Mensajes/mes | Precio |
|---|---|---|---|---|
| **Inicial** | 1.000 | ~33 | 5.000 | COP $89.000 (US$27,81) |
| **Típico** | 2.100 | 70 | 10.500 | COP $129.000 (US$40,31) |
| **Activo** | 3.000 | 100 | 15.000 | COP $169.000 (US$52,81) |

**Margen de cada plan:**

| Plan | Costo directo | Margen |
|---|---|---|
| Inicial | US$6,10–8,24 | 70–78% |
| Típico | US$10,21–14,70 | 63–75% |
| Activo | US$13,57–19,99 | 62–74% |

La utilidad escala con las conversaciones (**2.000** en Inicial, **4.200** en Típico y **6.000** en Activo); la publicidad son 4 al mes en los tres.

**Conversación extra:** cuesta US$0,0037–0,0059 (COP $12–19) y se puede vender a **COP $40**, con 53–70% de margen. **Campañas:** se cotizan aparte a la tarifa de Meta más 30%, porque 1.000 mensajes de publicidad cuestan US$12,50. **Almacenamiento:** COP $40.000 por 10 GB extra, porque el costo es fijo y predecible.

## F.5 Cobro único de entrada

| Concepto | Precio | Qué cubre |
|---|---|---|
| Alta y configuración del bot | COP $400.000–800.000 | Cuenta de WhatsApp Business, número, verificación de negocio, plantillas, base de conocimiento inicial, pruebas |
| Migración de documentos | COP $0–300.000 | Solo si el cliente entrega documentos desordenados o escaneados |
| Capacitación (1 sesión) | COP $0–200.000 | Opcional |
| **Total de entrada (pago único)** | **COP $400.000–1.300.000** | |

**Justificación:** el alta consume 4–8 h de trabajo a la tarifa de A.0 (COP $127.400/h), o sea COP $510.000–1.020.000. La tabla cotiza un paquete de entrada de COP $400.000–800.000 porque no todos los clientes requieren las 8 h; los casos complejos se completan con la migración de documentos. Cobrarlo aparte evita que el primer mes subsidie el alta del cliente y alinea el precio con el costo real. Incluye crear el número dentro de nuestra cuenta de empresa, la verificación de negocio y la aprobación de plantillas en Meta.

## F.6 ¿Aguanta el precio?

| Conversaciones/día | Costo directo/bot | Precio Típico (COP $129.000) | Margen |
|---|---|---|---|
| 20 | US$4,60–5,89 | US$40,31 | **85–89%** |
| 40 | US$6,85–9,41 | US$40,31 | **77–83%** |
| 60 | US$9,09–12,94 | US$40,31 | **68–77%** |
| **70 (base)** | **US$10,21–14,70** | **US$40,31** | **64–75%** |
| 80 | US$11,33–16,46 | US$40,31 | **59–72%** |
| 100 | US$13,57–19,99 | US$40,31 | **50–66%** |

**Conclusión:** a COP $129.000 el bot es rentable en todo el rango, pero el margen se estrecha con el uso: **85–89%** con 20 conversaciones al día y **50–66%** con 100. El plan Típico aguanta hasta unas **70 conversaciones diarias**; por encima conviene el Activo (COP $169.000), que a 100 deja 62–74%. El precio está dominado por la IA, que es la partida que decide el costo.

**Precio mínimo:** cubrir el peor caso del costo directo a 70 conversaciones (US$14,70) exige **COP $48.000**; a 100 conversaciones (US$19,99), **COP $64.000**. El precio de COP $129.000 deja margen para soporte y acompañamiento de entrada. Si la IA sube de precio o el bot hace más de 5 respuestas por conversación, el primer número que se mueve es la línea 2 de F.3.

## F.7 Lo que NO está en esta factura

- **Impuestos y comisiones de pasarela** (C.3): se suman al precio, no están dentro de él.
- **Identidad de marca, landing, contenido y legal** (C.1): son del negocio, no del producto.
- **Soporte telefónico, SLA y on-call** (C.2): se cotizan como bolsa de horas.
- **Integraciones a medida** (CRM, ERP, pasarela): cada una se cotiza a la tarifa de A.0.
- **Campañas de plantillas:** se cotizan aparte a la tarifa de Meta más 30% (F.4); el plan solo cubre las 4.204 plantillas mensuales.
- **Migrar un número que ya es del cliente:** si es un alta estándar va en F.5; si requiere trámite especial, se cotiza aparte.
