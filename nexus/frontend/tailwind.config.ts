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
                nexus: {
                    bg: "#050505",
                    card: "#0a0a0a",
                    border: "#1f1f1f",
                    accent: "#00ff41",
                    dim: "#003b00",
                    text: "#e5e5e5",
                    muted: "#737373",
                    danger: "#ff0033"
                },
            },
            fontFamily: {
                mono: ["Courier New", "monospace"],
                sans: ["Inter", "sans-serif"],
            },
            animation: {
                "scan-vertical": "scan 2s linear infinite",
            },
            keyframes: {
                scan: {
                    "0%": { transform: "translateY(-100%)" },
                    "100%": { transform: "translateY(100%)" },
                }
            },
        },
    },
    plugins: [],
};
export default config;
