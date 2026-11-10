# Example Dockerfile to build an n8n container with sghtmltopdf CLI bundled
FROM ghcr.io/waka/sghtmltopdf:latest AS sghtmltopdf-bin
FROM n8nio/n8n:latest

USER root

# Copy the sghtmltopdf binary and bundled fonts from the official image
COPY --from=sghtmltopdf-bin /usr/local/bin/sghtmltopdf /usr/local/bin/sghtmltopdf
COPY --from=sghtmltopdf-bin /usr/share/fonts/ /usr/share/fonts/

RUN chmod +x /usr/local/bin/sghtmltopdf

USER node
