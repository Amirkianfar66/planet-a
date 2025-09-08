import React from "react";
import Astronaut3DBase from "./Astronaut3DBase";
export default function Research({ name, showName = true, ...rest }) {
    return <Astronaut3DBase suit="#FFFFFF" prop="syringe" name={name} role="Research" showName={showName} {...rest} />;
}
