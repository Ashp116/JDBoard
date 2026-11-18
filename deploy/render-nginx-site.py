#!/usr/bin/env python3
"""Fill in deploy/nginx-jdboard.conf for scripts/install.sh.

usage: render-nginx-site.py TEMPLATE OUT HTTPS(0|1) HTTP_PORT HTTPS_PORT BACKEND_PORT TLS_DIR

With HTTPS the site listens on HTTPS_PORT with the certificate in TLS_DIR and
a small extra server on HTTP_PORT redirects everything to HTTPS; without it
the site listens on HTTP_PORT only.
"""
import sys


def render(template, https, http_port, https_port, backend_port, tls_dir):
    if https:
        target = 'https://$host' + ('' if https_port == '443' else f':{https_port}') + '$request_uri'
        redirect = (
            "server {\n"
            f"    listen {http_port} default_server;\n"
            f"    listen [::]:{http_port} default_server;\n"
            "    server_name _;\n"
            "    # Everything goes over HTTPS\n"
            f"    return 301 {target};\n"
            "}\n"
        )
        listen = (f"    listen {https_port} ssl default_server;\n"
                  f"    listen [::]:{https_port} ssl default_server;")
        tls = (
            "\n"
            f"    ssl_certificate {tls_dir}/jdboard.crt;\n"
            f"    ssl_certificate_key {tls_dir}/jdboard.key;\n"
            "    ssl_protocols TLSv1.2 TLSv1.3;\n"
            "    ssl_session_cache shared:jdboard_tls:1m;\n"
        )
    else:
        redirect, tls = '', ''
        listen = (f"    listen {http_port} default_server;\n"
                  f"    listen [::]:{http_port} default_server;")
    return (template.replace('@REDIRECT_SERVER@', redirect)
                    .replace('@LISTEN_DIRECTIVES@', listen)
                    .replace('@TLS_DIRECTIVES@', tls)
                    .replace('@BACKEND_PORT@', backend_port))


if __name__ == '__main__':
    if len(sys.argv) != 8:
        sys.exit(__doc__)
    template_path, out_path, https, http_port, https_port, backend_port, tls_dir = sys.argv[1:]
    with open(template_path) as f:
        conf = render(f.read(), https == '1', http_port, https_port, backend_port, tls_dir)
    with open(out_path, 'w') as f:
        f.write(conf)
