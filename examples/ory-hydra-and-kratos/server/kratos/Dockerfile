FROM oryd/kratos:v0.3

USER root

COPY ./config/ /etc/config/kratos/
RUN chown ory:ory /etc/config/kratos/

COPY setup /home/ory/setup

USER ory

ENTRYPOINT [""]
