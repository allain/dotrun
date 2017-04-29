const dotparser = require('dotparser')
const EventEmitter = require('events')
const promiseWhile = require('promise-while')(Promise)

class DotRun extends EventEmitter {
  constructor(dot, actions) {
    super()

    dot = (typeof dot === 'string') ? dotparser(dot) : dot

    this._actions = actions

    // thinking that this needs to be done recursively since graphs can be nested
    let edges = this._edges = dot[0].children.filter(c => c.type === 'edge_stmt').map(stmt => {
      let start = stmt.edge_list[0].id
      let end = stmt.edge_list[1].id

      let signal = stmt.attr_list.filter(a => a.id === 'label').map(a => a.eq)[0] || ''

      return { start, end, signal }
    })

    this._states = Object.keys(this._edges.reduce((states, e) => {
      states[e.start] = true
      states[e.end] = true
      return states
    }, {}))

    // no edges point to it
    this._startState = this._states.find(s => edges.filter(e => e.end === s).length === 0)

    // no edges point away from it
    this._finishState = this._states.find(s => edges.filter(e => e.start === s).length === 0)

    this._last = {
      state: null,
      signal: ''
    }
  }

  run() {
    this._context = {}
    this._last = {
      state: null,
      signal: ''
    }

    this.emit('started')

    return this._step().then(() => {
      return this._context
    })
  }

  _perform(stateName) {
    this.emit('performing', stateName)

    let action = this._findAction(stateName)

    let result;
    if (action) {
      result = action(this._context)
      result = result && result.then ? result : Promise.resolve(result)
    } else {
      this.emit('warning', 'unrecognized action: ' + stateName)
      result = Promise.resolve()
    }
    return result.then(signal => {
      this.emit('performed', stateName)

      return signal
    })
  }

  _findAction(stateName) {
    let action = this._actions[stateName]
    return action
  }

  _step() {
    let { state, signal } = this._last

    if (state === this._finishState)
      return Promise.reject(new Error('App has already finished'))

    let nextState = null
    if (state === null) {
      nextState = this._startState
    } else {
      let nextStates = this._edges.filter(e => e.start === state && e.signal === signal).map(e => e.end)
      if (nextStates.length === 0) {
        let error = {
          state,
          signal,
          error: `No next states possible from "${state}"${signal ? ` for "${signal}"` : ''}`
        }
        this.emit('error', error)

        return Promise.reject(new Error(error.error))
      }

      if (nextStates.length > 1) {
        let error = {
          state,
          signal,
          error: `Multiple next states possible from "${state}"${signal ? ` for "${signal}"` : ''} ${nextStates.join(', ')}`
        }
        this.emit('error', error)

        return Promise.reject(new Error(error.error))
      }

      nextState = nextStates[0]
    }

    return this._perform(nextState).then(signal => {
      this._last.state = nextState
      this._last.signal = signal || ''

      if (this._last.state !== this._finishState)
        return this._step()

      this.emit('finished', {})
    })
  }
}

module.exports = DotRun