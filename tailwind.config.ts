import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        gather: {
          50:  '#F7F3EE',
          100: '#EDE8E0',
          200: '#DDD4C8',
          300: '#C8BAA8',
          400: '#AE9B87',
          500: '#947E6A',
          600: '#7A6455',
          700: '#5E4D40',
          800: '#3D302A',
          900: '#251D18',
        },
      },
    },
  },
  plugins: [],
};
export default config;
