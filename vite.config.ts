import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Хэш-маршрутизация қолданылады, сондықтан кез келген статикалық хостингте base './' жеткілікті.
export default defineConfig({ plugins: [react()], base: './', build: { target: 'es2020', sourcemap: false } });
