"""Abstract base class for all models running on OpenModelStudio."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from context import ModelContext


class ModelInterface(ABC):
    """Base class that all user models must implement."""

    @abstractmethod
    def train(self, ctx: "ModelContext") -> None:
        """Train the model using the provided context.

        Args:
            ctx: ModelContext with dataset access, metric logging, checkpointing.
        """
        ...

    @abstractmethod
    def infer(self, ctx: "ModelContext") -> None:
        """Run inference using the provided context.

        Args:
            ctx: ModelContext with input data and output setter.
        """
        ...
