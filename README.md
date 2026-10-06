# 🌳 Árbol Genealógico · Familia Valenverguer

Página web para ver y construir el árbol genealógico de la familia, desde el computador o el celular.

- Árbol interactivo: arrastrar, zoom con la rueda o con dos dedos, buscador de personas.
- Personas con nombre, sexo, año de nacimiento, año de fallecimiento o edad y una descripción corta.
- Relaciones: padre, madre, hijos, esposo/a o pareja (también se puede vincular a alguien que ya existe).
- Fotos (desde la galería o la cámara), audios (grabados en la página o subidos) y textos o anécdotas.
- Transcripción automática de los audios con **Whisper**, ejecutado en el propio navegador (gratis, sin claves).
- Protegida con la contraseña familiar (compártela solo con la familia).
- Todo se guarda en **Supabase** (gratis), así toda la familia ve lo mismo desde cualquier dispositivo.

---

## 1. Crear la base de datos en Supabase (una sola vez)

1. Entra a <https://supabase.com>, crea una cuenta y un **New project** (anota la contraseña de la base de datos, aunque no la usarás aquí).
2. En el menú izquierdo abre **SQL Editor** → **New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   Esto crea las tablas, el espacio para fotos y audios (`family-media`) y las reglas de seguridad.
3. Ve a **Authentication → Users → Add user → Create new user**:
   - Email: `familia@valenverguer.app`
   - Password: la contraseña familiar
   - Marca **Auto Confirm User**.
4. Ve a **Authentication → Sign In / Providers** (o *Settings*) y **desactiva "Allow new users to sign up"**, para que nadie más pueda crear cuentas.
5. Ve a **Project Settings → API** (o *Data API*) y copia:
   - **Project URL**
   - **anon public key**
6. Pega esos dos valores en [`js/config.js`](js/config.js):

```js
export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

> La clave *anon* es pública por diseño: sin la contraseña familiar no permite leer ni modificar nada,
> porque las reglas de seguridad solo dejan pasar al usuario autenticado.

## 2. Publicar en GitHub Pages

1. Crea un repositorio nuevo en <https://github.com/new> (por ejemplo `arbol-genealogico`).
2. Sube todos los archivos de esta carpeta (con **Add file → Upload files**, o con git):

```bash
git init
```

```bash
git add . && git commit -m "Árbol genealógico" && git branch -M main
```

```bash
git remote add origin https://github.com/TU-USUARIO/arbol-genealogico.git && git push -u origin main
```

3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
4. En uno o dos minutos la página estará en `https://TU-USUARIO.github.io/arbol-genealogico/`.

Para cambiar la contraseña más adelante, cámbiala en Supabase (Authentication → Users → el usuario → *Reset/Update password*).

## 3. Probar en tu computador

Los módulos JavaScript necesitan un servidor (no basta con abrir `index.html` con doble clic):

```bash
python -m http.server 8080
```

Luego abre <http://localhost:8080>.
Si `js/config.js` está vacío, la página funciona en **modo local**: los datos se guardan solo en ese navegador. Sirve para probar, pero no se comparte con nadie.

## Uso

| Acción | Cómo |
|---|---|
| Agregar la primera persona | Botón **+ Persona** |
| Ver la ficha de alguien | Toca su tarjeta en el árbol |
| Agregar padre, madre, pareja o hijo | Botones de la ficha. Puedes crear una persona nueva o elegir una que ya exista |
| Quitar un vínculo | La ✕ junto al nombre en la sección *Familia* |
| Fotos | **+ Fotos** (puedes elegir varias). Toca una foto para verla en grande o ponerla como foto de perfil |
| Audios | **🎙 Agregar audio** → grabar o subir archivo. Se transcribe con Whisper y puedes corregir el texto |
| Textos | **+ Texto** para historias y anécdotas |

**Sobre Whisper:** la primera transcripción descarga el modelo (~80 MB) y queda guardado en el navegador;
las siguientes son más rápidas. En celulares antiguos puede tardar un poco; mantén la página abierta mientras transcribe.

## Límites del plan gratuito de Supabase

500 MB de base de datos y 1 GB de archivos. Las fotos se reducen automáticamente (máx. 1600 px) para ahorrar espacio.
Los proyectos gratuitos se pausan tras una semana sin uso; se reactivan con un clic desde el panel de Supabase.

## Estructura

```
index.html              página (login + aplicación)
css/styles.css          estilos (adaptado a celular, modo claro/oscuro)
js/config.js            ← aquí van los datos de Supabase
js/app.js               arranque y coordinación
js/tree.js              dibujo del árbol, zoom y gestos
js/person-panel.js      ficha de la persona
js/forms.js             formularios de personas y textos
js/recorder.js          grabación de audio
js/transcribe.js        preparación del audio para Whisper
js/whisper-worker.js    Whisper (transformers.js) en segundo plano
js/backend-supabase.js  guardado en Supabase
js/backend-local.js     guardado local (modo de prueba)
supabase/schema.sql     tablas y seguridad
```
