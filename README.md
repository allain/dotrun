# dotrun
A tool for using dot files to drive automation processes.

The basic idea is that by using dot files from graphviz, you can
design the flow of work through a complicated automation script.

It borrows some ideas from Cucumber and supports matching state action dynamically.

:

```js
const DotRun = require('dotrun')

let runner = new DotRun(`
  digraph example {
    Start -> "Say Hello"
    "Say Hello" -> "After Noon?"
    "After Noon?" -> "Say Good Afternoon" [label=YES]
    "After Noon?" -> "Say Good Morning" [label=NO]
    "Say Good Afternoon" -> Finish
    "Say Good Morning" -> Finish
  }`, {
    'Say {message}': ({message}) => {
      console.log(message)
    },
    'After Noon?': () => {
      return new Date().getHours() >= 12 ? 'YES' : 'NO'
    }
  })

runner.run().then(() => {
  console.log('Done')
})
```
