import React from "react";
import Astronaut3DBase from "./Astronaut3DBase";
export default function Officer({ name, showName = true, ...rest }) {
    return <Astronaut3DBase suit="#1E3A8A" prop="tablet" name={name} role="Officer" showName={showName} {...rest} />;
}
