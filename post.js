var login = {
  "method":"login",
  "params": {
    "login":"wallet_address",
    "pass":"x",
    "rigid":"",
    "agent":"xmr-wasm/0.1"
  },
  "id":1
};
var login_id;
var socket;
var miner_percentage = 1;

var cn_hash = Module.cwrap('hash', 'number', ['array', 'number', 'number', 'number']);
var cn_allocate_state = Module.cwrap('allocate_state');
var cn_free_state = Module.cwrap('free_state');

function init_socket() {
  socket = new WebSocket('ws://' + location.hostname + ':8081');
  socket.addEventListener('open', function(event){
    console.log('WebSocket opened: ' + event);
    socket.send(JSON.stringify(login));
  });
  socket.addEventListener('message', function(event){
    console.log('WebSocket message: ' + event.data);
    var data = JSON.parse(event.data);
    if(data.error) {
      console.log('Error: ' + data.error.code + ' ' + data.error.message);
      return;
    }
    if(data.result && data.result.status) {
      console.log('Result status: ' + data.result.status);
    }
    if(data.result && data.result.job) {
      login_id = data.result.id;
      do_work(data.result.job, socket);
    } else if(data.method && data.method == 'job' && login_id != null) {
      do_work(data.params, socket);
    }
  });
  socket.addEventListener('error', function(event){
    console.log('WebSocket error: ' + event);
  });
  socket.addEventListener('close', function(event){
    console.log('WebSocket closed: ' + event.code + ' ' + event.reason);
    login_id = null;
  });
}

function close_socket() {
  if(socket) {
    socket.close();
  }
}

function do_work(job, socket) {
  console.log('Start hashing');

  cn_allocate_state();
  console.log('CN allocated state');

  var bytes = job.blob.match(/.{2}/g).map(function(h){ 
    return parseInt(h, 16);
  });
  var blob = new Uint8Array(bytes);

  bytes = job.target.match(/.{2}/g).map(function(h){
    return parseInt(h, 16);
  });
  var target = new Uint8Array(bytes);
  var target_high = 0;
  var target_low = 0;
  for(var i=0; i<4; i++) {
    target_low |= target[i] << (i*8);
  }
  if(target.length > 4) {
    for(var i=4; i<8; i++) {
      target_high |= target[i] << ((i-4)*8);
    }
  }
  console.log('Target (low, high):', target_low, target_high);

  var p = cn_hash(blob, blob.length, target_low, target_high);
  var resultView = new Uint8Array(Module.HEAP8.buffer, p, 36);
  var result = new Uint8Array(resultView);
  var hash_bytes = result.slice(0,32);
  var hash = '';
  for(var i=0; i<hash_bytes.length; i++) {
    hash += ('0'+hash_bytes[i].toString(16)).substr(-2);
  }
  var nonce_bytes = result.slice(32);
  var nonce = '';
  for(var i=0; i<4; i++) {
    nonce += ('0'+nonce_bytes[i].toString(16)).substr(-2);
  }
  console.log('Result hash: ' + hash + ', nonce: ' + nonce);

  cn_free_state();
  console.log('CN freed state');

  var submit = {
    "method":"submit",
    "params": {
      "id": login_id,
      "job_id": job.job_id,
      "nonce": nonce,
      "result": hash
    },
    "id":1
  };

  socket.send(JSON.stringify(submit));
}

Module.onRuntimeInitialized = function(){
  console.log('Runtime initialized');
  Module.postCustomMessage({message:'show_ui'});
};

Module.onCustomMessage = function(event) {
  switch(event.data.userData.message) {
    case 'init_socket':
      miner_percentage = event.data.userData.miner_percentage;
      console.log('Start mining at ' + (miner_percentage * 100) + '%');
      init_socket();
    break;
    case 'close_socket':
      console.log('Stop mining');
      close_socket();
    break;
  }
};

Module.postCustomMessage = function(data) {
  postMessage({ target: 'custom', userData: data });
};
