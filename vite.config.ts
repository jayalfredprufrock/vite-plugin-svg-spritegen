import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        ssr: true,
        lib: {
            entry: 'src/index.ts',
            formats: ['es', 'cjs'],
            fileName: (format: string, entryName: string) => `${entryName}.${format}.js`,
        },
    },
    plugins: [],
});