"""This computer: the only address, a free port, the mark of a running server.

Apart from the server itself, so that the CLI does not load a web framework to ask.
"""

import socket
from pathlib import Path

HOST = "127.0.0.1"  # not configurable: there are no logins, so never listen outside


def run_file(db: Path, port: int) -> Path:
    """The mark of a running server: data/orbit.db on 8420 -> data/orbit-8420.run."""
    return db.with_name(f"{db.stem}-{port}.run")


def port_is_free(port: int) -> bool:
    with socket.socket() as probe:
        # On Windows a plain bind may succeed on a port that is already in use.
        exclusive = getattr(socket, "SO_EXCLUSIVEADDRUSE", None)
        if exclusive is not None:
            probe.setsockopt(socket.SOL_SOCKET, exclusive, 1)
        try:
            probe.bind((HOST, port))
        except OSError:
            return False
    return True
