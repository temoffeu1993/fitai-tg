import { useEffect, useState, type CSSProperties } from "react";

type Props = {
  text: string;
  speed?: number;
  style?: CSSProperties;
  className?: string;
};

export default function StreamingText({ text, speed = 28, style, className }: Props) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    let frame: number;
    let index = 0;
    setVisible("");

    const tick = () => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index < text.length) {
        frame = window.setTimeout(tick, speed);
      }
    };

    frame = window.setTimeout(tick, speed);
    return () => {
      window.clearTimeout(frame);
    };
  }, [text, speed]);

  return (
    <span className={className} style={style}>
      {visible || "\u00A0"}
    </span>
  );
}
