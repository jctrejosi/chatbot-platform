# Informe ejecutivo — costo y precio de un bot

**Corte:** 29-oct-2026 · **Moneda:** pesos colombianos a **3.200 COP por dólar** (el dólar observado está en 3.143; se usa 3.200 como margen) · **Fuente:** `analisis-costos.md` (bloques A, B y F)

Este informe resume tres cosas: cuánto costó **desarrollar** la plataforma, cuánto cuesta **operar el bot de un cliente** (100 conversaciones al día, 5 GB) y a qué **precio de venta** se debería ofrecer ese bot.

---

## 1. Resumen del costo de desarrollo (hasta hoy)

| Concepto | Horas | Costo |
|---|---|---|
| Primera versión del desarrollo (investigación) | 56 h | COP $7,13M |
| Segunda versión (comercial) | 74 h | COP $9,43M |
| **Desarrollo total (hasta hoy)** | **130 h** | **COP $16,56M** (US$5.176) |

Tarifa aplicada: **COP $127.400/h**, justificada por el conjunto de tecnologías del desarrollo (Node.js + Python, React, PostgreSQL + pgvector, WhatsApp Cloud API, DeepSeek, seguridad y despliegue continuo). El detalle por módulo y la justificación de la tarifa están en el bloque A de `analisis-costos.md`.

**Cómo se calculó el precio por hora:** la tarifa de COP $127.400/h es un **promedio ponderado** de bandas de mercado, porque el desarrollo exige varios perfiles que no vienen juntos en una sola persona. Cada perfil se pondera por su peso en las 130 h:

| Tipo de trabajo | % de horas | Perfil | Banda (COP/h) | Aporte (COP) |
|---|---|---|---|---|
| IA y búsqueda semántica | 17% | Especialista en IA | $140.000–200.000 | $28.900 |
| API, seguridad y mensajería | 21% | Senior de desarrollo completo | $110.000–160.000 | $28.350 |
| Interfaz de usuario | 20% | Intermedio | $60.000–90.000 | $15.000 |
| Infraestructura y base de datos | 19% | Infraestructura | $120.000–170.000 | $27.550 |
| Descubrimiento y coordinación | 23% | Senior / coordinación | $100.000–140.000 | $27.600 |
| **Promedio ponderado** | **100%** | | | **COP $127.400** |

No se usa tarifa de junior (COP $50.000/h), porque ese perfil no toma las decisiones que exige el stack (ventana de 24 h, aislamiento entre clientes, cifrado de credenciales); ni de agencia (COP $180.000–300.000/h), porque el equipo es interno y asume su propio riesgo.

---

## 2. La tabla única: 1 bot, 100 conversaciones al día (3.000 al mes)

| Concepto | Cálculo | USD/mes | COP/mes |
|---|---|---|---|
| Infraestructura (5 GB) | 5 GB sobre un VPS de US$30/mes (8 vCPU / 32 GB / 250 GB NVMe) | US$0,62–0,72 | COP $1.980–2.300 |
| WhatsApp: utilidades | 6.000 × US$0,0008 | US$4,80 | COP $15.360 |
| WhatsApp: publicidad | 4 × US$0,0125 | US$0,05 | COP $160 |
| IA (tokens) | 42,75 M tokens × US$0,15–0,30 / M | US$6,41–12,83 | COP $20.520–41.040 |
| **Costo total del bot** | | **US$11,88–18,40** | **COP $38.020–58.860** |

**De dónde sale cada línea:**

- **Infraestructura:** el VPS cuesta US$30 al mes y entrega 250 GB de disco. La cuota de 5 GB del bot vale 5 × (30 ÷ 250) = **US$0,60**, más dominio, certificado y respaldos repartidos (**US$0,02–0,12**). Es la única línea fija: no cambia con el volumen.
- **Utilidades:** 2 plantillas por conversación × 3.000 conversaciones = **6.000 al mes**. Meta cobra US$0,0008 por plantilla entregada → **US$4,80**.
- **Publicidad:** 4 envíos al mes, a US$0,0125 cada uno → **US$0,05**. No depende del volumen.
- **IA:** cada conversación gasta **14.250 tokens** (5 respuestas: 13.500 de entrada + 750 de salida). 3.000 conversaciones → **42,75 millones de tokens**. DeepSeek cobra US$0,15 por millón fuera de hora pico y US$0,30 en hora pico → **US$6,41–12,83**.

**Referencias rápidas:** por conversación, **COP $12,7–19,6**; por día (100 conversaciones), **COP $1.267–1.962**.

**Dos reglas que abaratan el cálculo:**
1. **Recibir mensajes es gratis e ilimitado.** El cliente escribe primero; Meta no cobra por recibir ni por responder dentro de la ventana de 24 h.
2. **Las utilidades de esta tabla son un techo.** Si la plantilla cae dentro de la ventana de 24 h, Meta no la cobra y ese renglón baja a US$0. Se calcula con las 6.000 cobradas para no subestimar el costo.

---

## 3. Cuando el cliente crece

Las utilidades y la IA crecen **en línea recta** con las conversaciones; la infraestructura y la publicidad se quedan fijas.

| Conversaciones/día | Conversaciones/mes | Tokens/mes | IA (COP) | Utilidades (COP) | **Costo total (COP)** |
|---|---|---|---|---|---|
| 100 | 3.000 | 42,75 M | $20.520–41.040 | $15.360 | **$38.020–58.860** |
| 200 | 6.000 | 85,50 M | $41.040–82.080 | $30.720 | **$73.900–115.260** |
| 400 | 12.000 | 171,00 M | $82.080–164.160 | $61.440 | **$145.660–228.060** |

La publicidad (COP $160) y la infraestructura (COP $1.980–2.300) ya están sumadas en cada columna. Pasar de 100 a 200 conversaciones diarias **duplica el costo variable**; la infraestructura no se mueve porque el chat es texto.

---

## 4. Precio sugerido de venta por bot (100 conversaciones al día)

| Concepto | Valor |
|---|---|
| **Costo directo del bot** | **COP $38.020–58.860/mes** |
| **Precio sugerido de venta** | **COP $169.000/mes** |
| Margen sobre el costo | 65–78% |
| Precio mínimo (cubrir el peor caso) | COP $59.000 |
| Rango para 70% de margen | COP $126.700–196.200 |

**Recomendación:** vender el bot de 100 conversaciones al día a **COP $169.000/mes** (el plan Activo de `analisis-costos.md`, F.4). Cubre el peor caso del costo con holgura (65–78% de margen) y deja espacio para soporte y acompañamiento de entrada. Si se quiere fijar el precio contra un margen exacto del 70%, el rango sería **COP $126.700–196.200**.

El desarrollo (COP $16,56M) **no entra en este precio mensual**: es una inversión ya incurrida que se recupera con el volumen de clientes, no con la tarifa de un solo bot.

---

## 5. Comparación con otros bots de WhatsApp para atención al cliente

Precios de referencia de bots hechos **específicamente para WhatsApp** y orientados a atención al cliente. Son **rangos orientativos** de precios públicos; conviene validarlos antes de una negociación.

| Plataforma | Enfoque | Precio de referencia (mes) | Modelo |
|---|---|---|---|
| ManyChat | Automatización por reglas | US$15–99 (COP $48.000–317.000) | Suscripción + cobro extra por contactos |
| WATI | Atención al cliente + IA | US$39–199 (COP $125.000–637.000) | Suscripción por número + IA como complemento |
| Zoko | Atención al cliente + IA | US$49–99 (COP $157.000–317.000) | Suscripción por equipo de agentes |
| AiSensy | Automatización + IA | US$39–119 (COP $125.000–381.000) | Suscripción + cobro extra por mensajes |
| Yellow.ai / Gupshup ACE | Agente IA empresarial | US$500+ (COP $1,6M+) | Enterprise / por conversación |

**Dónde queda este bot (COP $169.000/mes, US$53):**
- **Más completo que ManyChat o AiSensy:** incluye IA real que responde preguntas abiertas, sin cobrar extra por contacto ni por mensaje.
- **Más simple que WATI o Zoko:** no cobra por número de WhatsApp ni por asiento; es un precio plano por bot con la IA incluida.
- **Mucho más barato que los agentes IA empresariales (Yellow.ai, Gupshup ACE):** COP $169.000 contra tarifas de US$500+/mes.

**La ventaja de precio se sostiene en el modelo de costo:** este bot cobra un fijo mensual y su costo por conversación es COP $12,7–19,6, sin cobrar por contacto, número ni resolución. Por eso queda entre los automatizadores por reglas y los agentes IA por uso, con IA real incluida en un precio plano.
