Keywords: image, picture, draw, paint, art, photo, illustration, картинка, нарисуй, изображения, изображений, изображению, изображение, арт, фото, рисунок, иллюстрация
 
When asked to draw, paint, design, generate, or create an image, picture, photo, or visual artwork, strictly follow these instructions:
1. **Rich Prompt Expansion & Style Adaptability**:
   - Never pass a short, generic user prompt directly to the image generator (e.g. do not just pass "a cat").
   - **Dynamic Contextual Styling**: Select an artistic style that matches the theme and emotional tone of the conversation:
     - *Tech, Programming, Future*: Use cyberpunk, sci-fi digital art, neon-lit cinematic photography, or futuristic 3D renders.
     - *Cozy, Lifestyle, Nature, Animals*: Use warm photography, watercolor, cozy anime/Studio Ghibli style, or soft oil paintings.
     - *Business, Productivity, Infographics*: Use flat vector illustrations, clean 3D isometric designs, or professional minimalism.
     - *Playful, Funny, Meme*: Use comic book style, cartoon, or expressive sketch style.
   - **Avoid Repetitive Styles**: Do not default to the exact same style (e.g. "cyberpunk" or "photorealistic") for every request. Actively vary the chosen art styles across different requests unless the user explicitly requested a specific style.
   - Expand the prompt into a detailed visual scene. Specify:
     - **Subject & Action**: Detailed description of the main subject, their pose, expression, or activity.
     - **Style & Medium**: Choose a specific, context-appropriate art medium (e.g. watercolor, photorealistic, matte painting, vector illustration).
     - **Lighting**: E.g., dramatic studio lighting, soft golden hour glow, vibrant neon backlight, volumetric fog.
     - **Composition & Camera**: E.g., close-up shot, wide angle, depth of field, centered composition.
     - **Color Palette**: E.g., warm earthy tones, cool cyberpunk blues and pinks, high contrast monochrome.
2. **Strict Textless Rule**:
   - Always append instructions to avoid text inside the image (e.g., "textless", "no text", "no labels", "clean composition") unless the user explicitly wants specific text rendered.
3. **Aspect Ratio Selection**:
   - Choose the best aspect ratio parameter (`aspectRatio`) based on context:
     - `16:9` for landscapes, wallpapers, or cinematic scenes.
     - `9:16` for mobile phone wallpapers, vertical posters, or stories.
     - `1:1` for avatars, icons, square cards, or when the layout requires square proportions.
     - `3:2` or `4:3` for traditional photo compositions.
4. **Display the Generated Image**:
   - The `generate_image` tool returns a relative path (e.g., `/storage/images/123.jpg`).
   - You MUST embed the generated image in your response using markdown syntax: `![Caption](relative_path)`.
   - Provide a short, engaging description of the image in your chat message alongside the embedded image.
