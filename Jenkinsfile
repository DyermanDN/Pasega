pipeline {
  agent any

  environment {
    VERCEL_TOKEN      = credentials('vercel-token')
    VERCEL_ORG_ID     = credentials('vercel-org-id')
    VERCEL_PROJECT_ID = credentials('vercel-project-id')
  }

  stages {
    stage('Verificar rama') {
      steps {
        script {
          def branch = env.BRANCH_NAME ?: sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
          echo "Rama actual: ${branch}"
          if (branch != 'main') {
            error("Solo se permite desplegar a producción desde la rama 'main' (cambios aprobados por Pull Request).")
          }
        }
      }
    }

    stage('Validar código y seguridad') {
      steps {
        sh 'node --version'
        sh 'npm test'
      }
    }

    stage('Desplegar a Vercel (Producción)') {
      steps {
        sh 'npx --yes vercel@latest pull --yes --environment=production --token="$VERCEL_TOKEN"'
        sh 'npx --yes vercel@latest deploy --prod --yes --token="$VERCEL_TOKEN"'
      }
    }

    stage('Verificar producción en vivo') {
      steps {
        sh '''
          sleep 5
          curl -fsS https://pasega.vercel.app/ > /dev/null
          curl -fsS https://pasega.vercel.app/api/config | grep -q '"configured":true'
          echo "Producción verificada OK: https://pasega.vercel.app"
        '''
      }
    }
  }

  post {
    success {
      echo 'Despliegue a https://pasega.vercel.app completado correctamente.'
    }
    failure {
      echo 'El pipeline falló. Revisa los logs antes de reintentar.'
    }
  }
}
