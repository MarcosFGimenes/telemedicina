#!/usr/bin/env node

/**
 * Script de teste rápido para os novos endpoints da Rapidoc
 * 
 * Uso: node test-rapidoc-endpoints.js
 * 
 * Certifique-se de que o servidor está rodando: npm run dev
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testPlansEndpoint() {
  log('\n📋 Teste 1: Consultar Planos da Rapidoc', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  
  try {
    const response = await makeRequest('GET', '/api/rapidoc/planos');
    
    if (response.status === 200) {
      log('✅ Endpoint respondeu com sucesso!', 'green');
      
      if (Array.isArray(response.body)) {
        log(`✅ Retornou ${response.body.length} plano(s)`, 'green');
        
        if (response.body.length > 0) {
          const firstPlan = response.body[0];
          log(`\nPrimeiro plano:`, 'yellow');
          console.log(JSON.stringify(firstPlan, null, 2));
          
          // Verificar campos importantes
          if (firstPlan.uuid) {
            log('✅ Plano tem UUID (formato novo possível)', 'green');
          }
          if (firstPlan.serviceType || firstPlan.id) {
            log('✅ Plano tem serviceType (formato antigo)', 'green');
          }
        }
      } else {
        log('⚠️  Resposta não é um array', 'yellow');
        console.log(response.body);
      }
    } else {
      log(`❌ Endpoint retornou status ${response.status}`, 'red');
      console.log(response.body);
    }
  } catch (error) {
    log('❌ Erro ao conectar com o servidor', 'red');
    log(`   Certifique-se de que o servidor está rodando: npm run dev`, 'yellow');
    console.error(error.message);
  }
}

async function testBeneficiaryEndpoint() {
  log('\n👤 Teste 2: Criar Beneficiário (Formato Antigo)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  
  const testBeneficiary = {
    name: 'Teste Beneficiário',
    cpf: '12345678900',
    birthday: '1990-01-01',
    phone: '51999999999',
    email: 'teste@example.com',
    serviceType: 'GS',
    paymentType: 'S',
  };

  try {
    log('Enviando payload:', 'yellow');
    console.log(JSON.stringify(testBeneficiary, null, 2));
    
    const response = await makeRequest('POST', '/api/rapidoc/beneficiaries', [testBeneficiary]);
    
    if (response.status === 200) {
      log('✅ Beneficiário criado com sucesso!', 'green');
      console.log('\nResposta:', JSON.stringify(response.body, null, 2));
    } else {
      log(`❌ Endpoint retornou status ${response.status}`, 'red');
      console.log(response.body);
      
      if (response.status === 401) {
        log('⚠️  Verifique RAPIDOC_TOKEN e RAPIDOC_CLIENT_ID no .env.local', 'yellow');
      }
    }
  } catch (error) {
    log('❌ Erro ao criar beneficiário', 'red');
    console.error(error.message);
  }
}

async function testDependentsEndpoint() {
  log('\n👨‍👩‍👧‍👦 Teste 3: Criar Dependente', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  
  log('⚠️  Este teste requer autenticação (token JWT)', 'yellow');
  log('   Pule este teste se não tiver token.', 'yellow');
  
  // Teste não autenticado para ver a resposta
  const testDependent = {
    name: 'Dependente Teste',
    cpf: '98765432100',
    birthday: '2010-01-01',
  };

  try {
    const response = await makeRequest('POST', '/api/dependents/create', testDependent);
    
    if (response.status === 401) {
      log('✅ Endpoint protegido corretamente (401 Unauthorized)', 'green');
    } else if (response.status === 200) {
      log('✅ Dependente criado com sucesso!', 'green');
      console.log('\nResposta:', JSON.stringify(response.body, null, 2));
    } else if (response.status === 500) {
      log('❌ Erro 500 - Bug ainda presente!', 'red');
      console.log(response.body);
    } else {
      log(`Status inesperado: ${response.status}`, 'yellow');
      console.log(response.body);
    }
  } catch (error) {
    log('❌ Erro ao criar dependente', 'red');
    console.error(error.message);
  }
}

async function testWebhookEndpoint() {
  log('\n🔔 Teste 4: Webhook Asaas (Simulação)', 'blue');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
  
  const testEvent = {
    event: 'PAYMENT_CONFIRMED',
    id: 'evt_test_' + Date.now(),
    payment: {
      id: 'pay_test123',
      customer: 'cus_test123',
      status: 'CONFIRMED',
      value: 69.90,
      billingType: 'PIX',
      dueDate: new Date().toISOString().split('T')[0],
    },
  };

  try {
    log('Enviando evento de pagamento confirmado...', 'yellow');
    
    const response = await makeRequest('POST', '/api/asaas/webhook', testEvent);
    
    if (response.status === 200) {
      log('✅ Webhook processado com sucesso!', 'green');
      console.log('\nResposta:', JSON.stringify(response.body, null, 2));
    } else if (response.status === 401) {
      log('⚠️  Webhook requer secret (401)', 'yellow');
      log('   Configure ASAAS_WEBHOOK_SECRET no .env.local ou remova a validação', 'yellow');
    } else {
      log(`Status: ${response.status}`, 'yellow');
      console.log(response.body);
    }
  } catch (error) {
    log('❌ Erro ao processar webhook', 'red');
    console.error(error.message);
  }
}

async function runAllTests() {
  log('\n🚀 Iniciando testes dos novos endpoints da Rapidoc', 'blue');
  log('═══════════════════════════════════════════════════════════════════════', 'blue');
  
  await testPlansEndpoint();
  await testBeneficiaryEndpoint();
  await testDependentsEndpoint();
  await testWebhookEndpoint();
  
  log('\n═══════════════════════════════════════════════════════════════════════', 'blue');
  log('✅ Testes concluídos!', 'green');
  log('\nVerifique os resultados acima e consulte TESTE_GUIDE.md para mais detalhes.', 'yellow');
}

// Executar todos os testes
runAllTests().catch((error) => {
  log('\n❌ Erro fatal nos testes', 'red');
  console.error(error);
  process.exit(1);
});

