/** Paths refer to the remote computer, independent of the phone/browser OS. */
export function isAbsoluteHostPath(value:string):boolean{
  return value.startsWith('/')||/^[A-Za-z]:[\\/]/.test(value)||/^\\\\[^\\]+\\[^\\]+/.test(value);
}
