import React from "react";
import Astronaut3DBase from "./Astronaut3DBase";
export default function StationDirector({ name, showName = true, ...rest }) {
    return <Astronaut3DBase suit="#FF5A5A" prop="controller" name={name} role="Station Director" showName={showName} {...rest} />;
}
