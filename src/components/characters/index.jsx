export { default as Engineer } from "./Engineer";
export { default as Research } from "./Research";
export { default as StationDirector } from "./StationDirector";
export { default as Officer } from "./Officer";
export { default as Guard } from "./Guard";
export { default as FoodSupplier } from "./FoodSupplier";

export const ROLE_COMPONENTS = {
  Engineer:         (props) => <Engineer {...props} />,
  Research:         (props) => <Research {...props} />,
  "Station Director": (props) => <StationDirector {...props} />,
  Officer:          (props) => <Officer {...props} />,
  Guard:            (props) => <Guard {...props} />,
  "Food Supplier":  (props) => <FoodSupplier {...props} />,
};
