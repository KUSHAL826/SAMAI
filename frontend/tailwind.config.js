/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12172B",       // deep navy -- hero background, headline text on light
        paper: "#FBF9F4",     // warm off-white -- primary page background
        indigo: "#2C3468",    // brand primary
        amber: "#E8A33D",     // signal accent (used sparingly)
        slate: "#3A3F55",     // body text
        line: "#DCD7C9",      // hairline borders on paper background
        success: "#3E7A5C",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};
