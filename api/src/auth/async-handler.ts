import type { Request, Response, NextFunction } from 'express'

/** Express 4 doesn't catch rejected promises from async handlers — wrap them. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
