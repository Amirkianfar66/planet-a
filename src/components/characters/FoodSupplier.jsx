import React from "react";
import Astronaut3DBase from "./Astronaut3DBase";
export default function FoodSupplier({ name, showName = true, ...rest }) {
    return <Astronaut3DBase suit="#FFC83D" prop="backpack" name={name} role="Food Supplier" showName={showName} {...rest} />;
}
