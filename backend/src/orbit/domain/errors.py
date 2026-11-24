"""Domain errors. The CLI maps each one to a message and an exit code."""


class OrbitError(Exception):
    """Base class for expected, user-facing errors."""


class ValidationError(OrbitError):
    """Input breaks a rule: unknown status, text too long, wrong project, ..."""


class NotFoundError(OrbitError):
    """Project, milestone or task does not exist."""


class ConflictError(OrbitError):
    """The change is allowed only with force, e.g. closing a milestone with open tasks."""
