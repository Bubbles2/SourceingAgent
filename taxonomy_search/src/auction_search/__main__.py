"""Allow ``python -m auction_search <command>`` as a shorthand for ``python -m auction_search.cli``."""

import sys

from auction_search.cli import main

sys.exit(main())
