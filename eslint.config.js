import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Leer un const/let antes de su declaracion NO es un error de tipos: tsc
      // lo deja pasar y el bundle se arma. Revienta en el navegador, y como el
      // fallo es al montar el componente, lo que se ve es una pantalla en negro
      // sin ninguna pista. Nos costo un dia entero de produccion dos veces en
      // la misma jornada — una en la vista del chatter, otra en la del
      // coordinador.
      //
      // El caso tipico no es una llamada directa sino el ARREGLO DE
      // DEPENDENCIAS de un useEffect, que se evalua al renderizar:
      //   useEffect(() => {...}, [now]);   // ← revienta
      //   const [now] = useState(...);     //   si `now` se declara aca abajo
      //
      // Las funciones quedan permitidas (se izan y el uso es diferido), que es
      // el patron normal de handlers declarados abajo del JSX.
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": ["error", {
        functions: false,
        classes: false,
        variables: true,
        allowNamedExports: true,
      }],
    },
  },
);
