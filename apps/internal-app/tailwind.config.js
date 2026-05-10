/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d1d1d",
        muted: "#5f6676",
        line: "#d7efea",
        green: {
          DEFAULT: "#2edebe",
          dark: "#137765",
        },
        red: "#ca4e4e",
        surface: {
          DEFAULT: "#f6f9fc",
          soft: "#f5fffc",
        },
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#2D6A4F",
          800: "#1e4d38",
          900: "#14532d",
        },
      },
      fontFamily: {
        sans: ['"Open Sans"', "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"],
        comfortaa: ['"Comfortaa"', "system-ui", "sans-serif"],
        montserrat: ['"Montserrat"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 45px rgba(29, 29, 29, 0.06)",
        modal: "0 24px 80px rgba(17, 23, 22, 0.22)",
      },
      screens: {
        mobile: { max: "760px" },
      },
    },
  },
  plugins: [],
};
