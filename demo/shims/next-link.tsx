import { forwardRef, type AnchorHTMLAttributes } from "react";
import { navigate } from "../router";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: boolean };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href="#"
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        navigate(href);
      }}
    />
  );
});
export default Link;
