
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'

export class RenewableProcess {
  private _currentProcess?: ChildProcessWithoutNullStreams
  private _isShutdown: boolean
  private _cmd: string
  private _timeout: number

  constructor({ timeout = 0, cmd }: { timeout?: number; cmd: string }) {
    this._isShutdown = false
    this._cmd = cmd
    this._timeout = timeout
    this._runNewProcess()
  }

  public shutdown() {
    this._isShutdown = true
    this._currentProcess?.kill()
  }

  private async _runNewProcess() {
    this._currentProcess = spawn(this._cmd, { shell: true })
    this._currentProcess.stdout.on('data', async data => {
      console.log(`${data} ${data}`)
    })
    this._currentProcess.stderr.on('error', async error => {
      console.log(`${error} ${error}`)
    })
    this._currentProcess!.on('close', async code => {
      if (!this._isShutdown) {
        console.log(`reload, code ${code}`)
        setTimeout(() => {
          this._runNewProcess()
        }, this._timeout)
      } else {
        console.log(`stop, code ${code}`)
      }
    })
  }
}