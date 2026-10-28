from fastapi import HTTPException, status

class MuleMatrixException(Exception):
    def __init__(self, message: str, code: str = "GENERIC_ERROR", details: dict = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

class LedgerValidationError(MuleMatrixException):
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="LEDGER_VALIDATION_ERROR", details=details)

class ResourceNotFoundError(MuleMatrixException):
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="RESOURCE_NOT_FOUND", details=details)

class TraversalBudgetExceededError(MuleMatrixException):
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, code="TRAVERSAL_BUDGET_EXCEEDED", details=details)
