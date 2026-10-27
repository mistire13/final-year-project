import "react-native-svg";
// Phosphor's supported source entry points forward this web-only SVG prop.
declare module "react-native-svg" {
  interface SvgProps { className?: string; }
}
