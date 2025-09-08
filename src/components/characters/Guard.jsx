import React from "react";
import Astronaut3DBase from "./Astronaut3DBase";
export default function Guard({ name, showName = true, ...rest }) {
    return <Astronaut3DBase suit="#68C7FF" prop="gun" name={name} role="Guard" showName={showName} {...rest} />;
}
