/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  important: true,
  theme: {
    extend: {
      colors: {
        Malibu: "#61DAFB",
        Iron: "#D5D9DD",
        BlueLagoon: "#027D95",
        OsloGray: "#848E97",
        Alabaster: "#FAFAFA",
        YellowSea: "#FAAE04",
        Malachite: "#14BD52",
        BrightTurquoise: "#0EC9C9",
        OldLace: "#FDF2E1",
        GrannyApple: "#DDF7E3",
        Iceberg: "#E3F6F4",
        Sunglow: "#FFCC2F",
        ForestGreen: "#2BAF2B",
        Cerulean: "#00ACEE",
        FrenchPass: "#B3EAFF",
        Madang: "#C2F0C2",
        EarlyDawn: "#FFF9E5",
      },
    },
  },
  plugins: [],
};
