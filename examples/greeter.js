const DotRun = require('..')

let runner = new DotRun(`
  digraph example {
      Start -> "Say Hello"
      "Say Hello" -> "After Noon?"
      "After Noon?" -> "Say Good Afternoon" [label=YES]
      "After Noon?" -> "Say Good Morning" [label=NO]
      "Say Good Afternoon" -> Finish
      "Say Good Morning" -> Finish
    }
  `, {
  'Say {message}': ({ message }) => {
    console.log(message)
  },
  'After Noon?': () => {
    return new Date().getHours() >= 12 ? 'YES' : 'NO'
  }
})
runner.on('error', (err) => {
  console.error(err)
})
runner.run().then(() => {
  console.log('Done')
}, err => console.error(err))
